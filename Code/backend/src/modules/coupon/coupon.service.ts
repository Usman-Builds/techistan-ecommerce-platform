import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  CouponType,
  DiscountStatus,
  Prisma,
  ProductStatus,
  PromotionScope,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoryService } from '../category/category.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ListCouponsQueryDto } from './dto/list-coupons-query.dto';
import {
  CreateAutomaticDiscountDto,
  UpdateAutomaticDiscountDto,
} from './dto/automatic-discount.dto';
import { BulkSaleDto, SetSalePriceDto } from './dto/set-sale-price.dto';
import { BulkCouponDto, GenerateCouponsDto } from './dto/generate-coupons.dto';

/**
 * One cart/order line, reduced to just what a promotion needs to decide whether
 * it applies. Deliberately not a CartLineView — the promotions domain must not
 * depend on the cart's presentation shape.
 */
export interface PromotionLine {
  productId: string;
  /** Owning category, or null for an unfiled product. */
  categoryId: string | null;
  /** Purchasable quantity (already stock-clamped by the caller). */
  quantity: number;
  /** unit effective price × quantity, in cents. */
  lineTotalCents: number;
  /** True when a scheduled sale price is currently in effect for this line. */
  onSale: boolean;
}

/** Minimal context a coupon is validated against (avoids coupling to Cart). */
export interface CouponValidationContext {
  /** Cart subtotal in integer cents (sum of current line prices). */
  subtotalCents: number;
  /** Owning customer id, or null/undefined for a guest cart. */
  userId?: number | null;
  /**
   * The cart's lines. Required for a CATEGORY- or PRODUCT-scoped promotion —
   * without them there is no way to tell which money is eligible, and this
   * service refuses to guess (see {@link CouponService.eligibleSubtotal}).
   */
  lines?: PromotionLine[];
}

/** Result of a successful validation. */
export interface CouponValidationResult {
  code: string;
  type: CouponType;
  /** Discount applied to the item subtotal, in cents (0 for FREE_SHIPPING). */
  discountCents: number;
  /** True when the coupon waives shipping (applied by the shipping estimator). */
  freeShipping: boolean;
  /** The portion of the subtotal this coupon was allowed to discount. */
  eligibleSubtotalCents: number;
  /** ALL, or the restriction that narrowed `eligibleSubtotalCents`. */
  scope: PromotionScope;
}

/** Context an automatic discount is evaluated against. */
export interface AutomaticDiscountContext {
  subtotalCents: number;
  /** Total purchasable item count in the cart. */
  itemCount: number;
  /** As on {@link CouponValidationContext} — required for scoped rules. */
  lines?: PromotionLine[];
}

/** One applied automatic (no-code) discount. */
export interface AppliedAutomaticDiscount {
  id: string;
  name: string;
  discountCents: number;
  freeShipping: boolean;
}

/** The JSON rule shape stored on AutomaticDiscount.rule. */
interface AutomaticRule {
  minSubtotal?: number;
  minQty?: number;
  percentOff?: number;
  amountOff?: number;
  freeShipping?: boolean;
}

/**
 * Alphabet for generated coupon codes. O/0 and I/1 are excluded because these
 * codes are read off a screen and typed by hand, where those pairs are the
 * classic source of "the code doesn't work" support tickets.
 */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random code of `length` characters from {@link CODE_ALPHABET}. */
function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

/**
 * Scope restrictions, loaded wherever a promotion's applicability is decided.
 * Ids only — the promotions maths never needs the joined rows themselves.
 */
const SCOPE_INCLUDE = {
  products: { select: { productId: true } },
  categories: { select: { categoryId: true } },
} as const;

/** Fields needed to compute a coupon discount (subset of Coupon). */
type DiscountableCoupon = Pick<
  Prisma.CouponGetPayload<true>,
  'type' | 'value' | 'maxDiscount'
>;

/**
 * Promotions domain service (script 12, FR-601..605). Owns coupon validation and
 * redemption, automatic cart-rule discounts, scheduled sale pricing, and the
 * admin CRUD for all three. Extends the script-09 validation seam rather than
 * replacing it — the cart (09) and checkout (10) still call {@link validate} and
 * {@link recordRedemption}.
 *
 * ── Stacking precedence (documented rule) ────────────────────────────────────
 * At most ONE automatic discount (the highest-priority applicable one) and ONE
 * coupon apply to a cart. Both are computed against the raw item subtotal (they
 * do NOT compound on each other), then summed and clamped so the combined
 * discount never exceeds the subtotal. Automatic discounts are evaluated first.
 * FREE_SHIPPING from either source waives shipping in the estimator (09/10).
 */
@Injectable()
export class CouponService {
  private readonly logger = new Logger(CouponService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: CategoryService,
  ) {}

  // ─────────────────────────── Validation (FR-601/602) ───────────────────────

  /**
   * Validate a coupon code against a cart context. Throws
   * {@link BadRequestException} with a user-facing message on any failure;
   * returns the normalized code + computed discount on success. Does NOT record
   * a redemption — that happens at order/payment success ({@link recordRedemption}).
   */
  async validate(
    rawCode: string,
    ctx: CouponValidationContext,
  ): Promise<CouponValidationResult> {
    const code = rawCode.trim();
    if (!code) throw new BadRequestException('Enter a coupon code.');

    const coupon = await this.prisma.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      include: SCOPE_INCLUDE,
    });
    if (!coupon || !coupon.active) {
      throw new BadRequestException('That coupon code is not valid.');
    }

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) {
      throw new BadRequestException('This coupon is not active yet.');
    }
    if (coupon.expiresAt && coupon.expiresAt < now) {
      throw new BadRequestException('This coupon has expired.');
    }
    if (coupon.minOrder != null && ctx.subtotalCents < coupon.minOrder) {
      throw new BadRequestException(
        `Spend at least ${this.dollars(coupon.minOrder)} to use this coupon.`,
      );
    }

    // Global usage limit.
    if (coupon.usageLimit != null) {
      const used = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id },
      });
      if (used >= coupon.usageLimit) {
        throw new BadRequestException(
          'This coupon has reached its usage limit.',
        );
      }
    }

    // Per-customer limit (only enforceable for a signed-in customer).
    if (coupon.perCustomerLimit != null && ctx.userId != null) {
      const usedByUser = await this.prisma.couponRedemption.count({
        where: { couponId: coupon.id, userId: ctx.userId },
      });
      if (usedByUser >= coupon.perCustomerLimit) {
        throw new BadRequestException(
          'You have already used this coupon the maximum number of times.',
        );
      }
    }

    // Scope gate. A restricted coupon discounts only the money it is allowed to
    // touch, so the discount is computed on the ELIGIBLE subtotal — never the
    // cart subtotal. `minOrder` above stays a cart-level gate, which is the
    // conventional reading of "spend $50 to use this".
    const eligibleSubtotalCents = await this.eligibleSubtotal(coupon, ctx);
    if (
      coupon.type !== CouponType.FREE_SHIPPING &&
      eligibleSubtotalCents <= 0
    ) {
      throw new BadRequestException(
        this.scopeRejectionMessage(coupon.scope, coupon.appliesToSaleItems),
      );
    }

    return {
      code: coupon.code,
      type: coupon.type,
      discountCents: this.computeDiscount(coupon, eligibleSubtotalCents),
      freeShipping: coupon.type === CouponType.FREE_SHIPPING,
      eligibleSubtotalCents,
      scope: coupon.scope,
    };
  }

  /**
   * The slice of a cart a promotion is allowed to discount.
   *
   * An unrestricted promotion that also allows sale items is just the whole
   * subtotal, and takes the fast path without touching the database.
   *
   * Anything narrower needs the cart's lines. If the caller didn't supply them,
   * a restricted promotion returns 0 (→ "doesn't apply") rather than falling
   * back to the full subtotal: silently discounting the whole cart because we
   * lacked the data to restrict it is a merchant-money bug, and refusing is the
   * safe direction to fail.
   */
  private async eligibleSubtotal(
    promotion: {
      scope: PromotionScope;
      appliesToSaleItems: boolean;
      products: { productId: string }[];
      categories: { categoryId: string }[];
    },
    ctx: { subtotalCents: number; lines?: PromotionLine[] },
  ): Promise<number> {
    const unrestricted =
      promotion.scope === PromotionScope.ALL && promotion.appliesToSaleItems;
    if (unrestricted) return ctx.subtotalCents;

    const lines = ctx.lines;
    if (!lines) {
      return promotion.scope === PromotionScope.ALL ? ctx.subtotalCents : 0;
    }

    // Category scoping is by SUBTREE: "20% off Computers" has to cover a laptop
    // filed under Computers → Laptops.
    const categoryIds =
      promotion.scope === PromotionScope.CATEGORY
        ? new Set(
            await this.categories.descendantIds(
              promotion.categories.map((c) => c.categoryId),
            ),
          )
        : new Set<string>();
    const productIds = new Set(promotion.products.map((p) => p.productId));

    return lines.reduce((sum, line) => {
      if (!promotion.appliesToSaleItems && line.onSale) return sum;
      if (
        promotion.scope === PromotionScope.PRODUCT &&
        !productIds.has(line.productId)
      ) {
        return sum;
      }
      if (
        promotion.scope === PromotionScope.CATEGORY &&
        !(line.categoryId && categoryIds.has(line.categoryId))
      ) {
        return sum;
      }
      return sum + line.lineTotalCents;
    }, 0);
  }

  /** Why a scoped coupon didn't apply, in words a shopper can act on. */
  private scopeRejectionMessage(
    scope: PromotionScope,
    appliesToSaleItems: boolean,
  ): string {
    if (scope === PromotionScope.CATEGORY) {
      return 'This coupon only applies to certain categories, and none of them are in your basket.';
    }
    if (scope === PromotionScope.PRODUCT) {
      return 'This coupon only applies to certain products, and none of them are in your basket.';
    }
    if (!appliesToSaleItems) {
      return 'This coupon cannot be combined with items already on sale.';
    }
    return 'This coupon does not apply to anything in your basket.';
  }

  /**
   * Finalize a redemption at payment success (scripts 10/12, FR-414). Records one
   * {@link CouponRedemption} for the order (with the attributed discount) and
   * increments the denormalized `usedCount`, atomically inside the caller's
   * confirmation transaction. Idempotent per order via the unique
   * `(couponId, orderId)` index — a second call for the same order is a no-op and
   * never throws (so a webhook retry cannot roll back the confirmation).
   */
  async recordRedemption(
    tx: Prisma.TransactionClient,
    code: string,
    orderId: string,
    userId: number | null,
  ): Promise<void> {
    const coupon = await tx.coupon.findFirst({
      where: { code: { equals: code, mode: 'insensitive' } },
      select: {
        id: true,
        type: true,
        value: true,
        maxDiscount: true,
        scope: true,
        appliesToSaleItems: true,
        products: { select: { productId: true } },
        categories: { select: { categoryId: true } },
      },
    });
    if (!coupon) {
      this.logger.warn(
        `recordRedemption: coupon "${code}" not found for order ${orderId}; skipping.`,
      );
      return;
    }
    // Idempotency guard — never let a duplicate create throw inside the shared tx.
    const already = await tx.couponRedemption.findFirst({
      where: { couponId: coupon.id, orderId },
      select: { id: true },
    });
    if (already) return;

    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: {
        subtotal: true,
        discountTotal: true,
        items: {
          select: {
            total: true,
            quantity: true,
            variant: {
              select: {
                productId: true,
                product: { select: { categoryId: true } },
              },
            },
          },
        },
      },
    });

    // Attribute only what this coupon could actually have discounted. The old
    // behaviour recomputed against the whole order subtotal, which over-reports
    // a scoped coupon (a "20% off audio" code on a mostly-laptop order looked
    // four times as effective as it was).
    //
    // The sale-item exclusion can't be replayed here — an order line snapshots
    // its price, not whether that price was a sale — so a coupon that excluded
    // sale items attributes against all of its in-scope lines. It is capped by
    // the order's real discountTotal below, so it can never over-report the
    // money the store actually gave away.
    const lines: PromotionLine[] = (order?.items ?? []).map((item) => ({
      productId: item.variant?.productId ?? '',
      categoryId: item.variant?.product?.categoryId ?? null,
      quantity: item.quantity,
      lineTotalCents: item.total,
      onSale: false,
    }));
    const eligible = await this.eligibleSubtotal(
      { ...coupon, appliesToSaleItems: true },
      { subtotalCents: order?.subtotal ?? 0, lines },
    );
    const discountCents = Math.min(
      this.computeDiscount(coupon, eligible),
      order?.discountTotal ?? Number.MAX_SAFE_INTEGER,
    );

    await tx.couponRedemption.create({
      data: {
        couponId: coupon.id,
        orderId,
        userId: userId ?? null,
        discountCents,
      },
    });
    await tx.coupon.update({
      where: { id: coupon.id },
      data: { usedCount: { increment: 1 } },
    });
    this.logger.log(
      `coupon.redeemed code=${code} order=${orderId} discount=${discountCents}`,
    );
  }

  /** Discount (cents) applied to the item subtotal for a validated coupon. */
  computeDiscount(coupon: DiscountableCoupon, subtotalCents: number): number {
    switch (coupon.type) {
      case CouponType.PERCENT: {
        // value is a whole percent (0-100); cap at maxDiscount, never the subtotal.
        const raw = Math.floor((subtotalCents * coupon.value) / 100);
        const capped =
          coupon.maxDiscount != null ? Math.min(raw, coupon.maxDiscount) : raw;
        return Math.min(subtotalCents, capped);
      }
      case CouponType.FIXED:
        return Math.min(subtotalCents, coupon.value);
      case CouponType.FREE_SHIPPING:
      default:
        // Shipping waiver is applied by the shipping estimator, not here.
        return 0;
    }
  }

  // ─────────────────────────── Automatic discounts (FR-603) ──────────────────

  /**
   * Evaluate active, in-window automatic discounts against a cart. Applies the
   * single highest-priority rule whose gates (`minSubtotal`/`minQty`) are met —
   * see the stacking-precedence note on the class. Returns an array (0 or 1) for
   * forward compatibility with multi-stacking.
   */
  async evaluateAutomaticDiscounts(
    ctx: AutomaticDiscountContext,
  ): Promise<AppliedAutomaticDiscount[]> {
    const now = new Date();
    const discounts = await this.prisma.automaticDiscount.findMany({
      where: {
        status: DiscountStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      include: SCOPE_INCLUDE,
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
    });

    for (const d of discounts) {
      const rule = (d.rule ?? {}) as AutomaticRule;
      // The gates read the CART subtotal/quantity — "spend $50" means spend $50
      // overall, even for a rule that then only discounts one category.
      if (rule.minSubtotal != null && ctx.subtotalCents < rule.minSubtotal) {
        continue;
      }
      if (rule.minQty != null && ctx.itemCount < rule.minQty) continue;

      // …but the discount itself is computed on the eligible slice only.
      const eligible = await this.eligibleSubtotal(d, ctx);
      if (eligible <= 0 && !rule.freeShipping) continue;

      let discountCents = 0;
      if (rule.percentOff) {
        discountCents = Math.floor((eligible * rule.percentOff) / 100);
      } else if (rule.amountOff) {
        discountCents = Math.min(eligible, rule.amountOff);
      }
      const freeShipping = rule.freeShipping === true;

      // A rule with no monetary effect at all is skipped (nothing to apply).
      if (discountCents <= 0 && !freeShipping) continue;

      return [
        {
          id: d.id,
          name: d.name,
          discountCents: Math.min(eligible, discountCents),
          freeShipping,
        },
      ];
    }
    return [];
  }

  // ─────────────────────────── Admin: coupons (FR-806) ───────────────────────

  async createCoupon(dto: CreateCouponDto, actorId: number | null) {
    const code = dto.code.trim().toUpperCase();
    await this.assertCodeAvailable(code);
    this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);
    try {
      const coupon = await this.prisma.coupon.create({
        data: {
          code,
          name: dto.name ?? null,
          description: dto.description ?? null,
          type: dto.type,
          value: dto.value,
          minOrder: dto.minOrder ?? null,
          maxDiscount: dto.maxDiscount ?? null,
          usageLimit: dto.usageLimit ?? null,
          perCustomerLimit: dto.perCustomerLimit ?? null,
          startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          active: dto.active ?? true,
          isPublic: dto.isPublic ?? false,
          scope: dto.scope ?? PromotionScope.ALL,
          appliesToSaleItems: dto.appliesToSaleItems ?? true,
          products: {
            create: (dto.productIds ?? []).map((productId) => ({ productId })),
          },
          categories: {
            create: (dto.categoryIds ?? []).map((categoryId) => ({
              categoryId,
            })),
          },
        },
        include: SCOPE_INCLUDE,
      });
      await this.audit.record({
        actorId,
        action: 'coupon.create',
        entityType: 'Coupon',
        entityId: coupon.id,
        metadata: { code: coupon.code, type: coupon.type, scope: coupon.scope },
      });
      return coupon;
    } catch (err) {
      throw this.mapUniqueError(err, code);
    }
  }

  /**
   * Mint a batch of single-use codes in one call (FR-806, script 18).
   *
   * A win-back or influencer campaign needs N unique codes sharing one set of
   * rules; creating them one at a time through the form is not a workflow.
   * Every code in a batch carries the same batchId, so the whole run can be
   * listed, disabled or deleted as a unit afterwards.
   *
   * Codes use an unambiguous alphabet (no O/0/I/1) because these get read off
   * screens and typed by hand. Candidates are checked against the codes already
   * in the database and the ones minted so far in this call; the unique index on
   * Coupon.code remains the real guarantee.
   */
  async generateCoupons(dto: GenerateCouponsDto, actorId: number | null) {
    this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);

    const prefix = (dto.prefix ?? '').trim().toUpperCase();
    const suffixLength = dto.suffixLength ?? 8;
    const separator = dto.separator ?? '-';
    const batchId = 'batch_' + Date.now().toString(36) + randomCode(6);

    const existing = await this.prisma.coupon.findMany({
      where: prefix ? { code: { startsWith: prefix } } : {},
      select: { code: true },
    });
    const taken = new Set(existing.map((c) => c.code));

    const codes: string[] = [];
    // Bounded so an impossible request (say 500 codes from a 2-char suffix)
    // fails fast instead of spinning.
    const maxAttempts = dto.count * 40;
    for (let attempt = 0; codes.length < dto.count; attempt++) {
      if (attempt >= maxAttempts) {
        throw new BadRequestException(
          'Could not generate enough unique codes. Use a longer suffix or a different prefix.',
        );
      }
      const suffix = randomCode(suffixLength);
      const candidate = prefix ? prefix + separator + suffix : suffix;
      if (taken.has(candidate)) continue;
      taken.add(candidate);
      codes.push(candidate);
    }

    const created = await this.prisma.$transaction(
      codes.map((code) =>
        this.prisma.coupon.create({
          data: {
            code,
            batchId,
            name: dto.name ?? null,
            description: dto.description ?? null,
            type: dto.type,
            value: dto.value,
            minOrder: dto.minOrder ?? null,
            maxDiscount: dto.maxDiscount ?? null,
            // A generated batch defaults to one use each, overall and per
            // customer: that is what makes the codes individual rather than a
            // single shared code printed N times.
            usageLimit: dto.usageLimit ?? 1,
            perCustomerLimit: dto.perCustomerLimit ?? 1,
            startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
            expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
            active: dto.active ?? true,
            // Never advertise a generated batch — these are per-shopper codes.
            isPublic: false,
            scope: dto.scope ?? PromotionScope.ALL,
            appliesToSaleItems: dto.appliesToSaleItems ?? true,
            products: {
              create: (dto.productIds ?? []).map((productId) => ({
                productId,
              })),
            },
            categories: {
              create: (dto.categoryIds ?? []).map((categoryId) => ({
                categoryId,
              })),
            },
          },
        }),
      ),
    );

    await this.audit.record({
      actorId,
      action: 'coupon.generate',
      entityType: 'Coupon',
      entityId: batchId,
      metadata: { count: created.length, prefix: prefix || null, batchId },
    });

    return { batchId, count: created.length, coupons: created };
  }

  /**
   * Activate / deactivate / delete many coupons at once, addressed either by a
   * list of ids or by batch. Deleting cascades their redemptions, so the count
   * returned is what the confirmation dialog should have warned about.
   */
  async bulkCouponAction(dto: BulkCouponDto, actorId: number | null) {
    if (!dto.batchId && (dto.ids ?? []).length === 0) {
      throw new BadRequestException('Select at least one coupon.');
    }
    const where: Prisma.CouponWhereInput = dto.batchId
      ? { batchId: dto.batchId }
      : { id: { in: dto.ids ?? [] } };

    const affected =
      dto.action === 'delete'
        ? await this.prisma.coupon.deleteMany({ where })
        : await this.prisma.coupon.updateMany({
            where,
            data: { active: dto.action === 'activate' },
          });

    await this.audit.record({
      actorId,
      action: 'coupon.bulk.' + dto.action,
      entityType: 'Coupon',
      entityId: dto.batchId ?? 'selection',
      metadata: { count: affected.count },
    });

    return { action: dto.action, count: affected.count };
  }

  /**
   * Coupons the storefront may advertise: opted in, active, inside their window
   * and not exhausted. Codes ARE returned (that is the point of an offers
   * strip), but only for coupons a merchant explicitly marked public.
   */
  async listPublicOffers() {
    const now = new Date();
    const rows = await this.prisma.coupon.findMany({
      where: {
        isPublic: true,
        active: true,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ expiresAt: null }, { expiresAt: { gte: now } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 12,
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        type: true,
        value: true,
        minOrder: true,
        maxDiscount: true,
        expiresAt: true,
        scope: true,
        usageLimit: true,
        usedCount: true,
      },
    });

    // Exhausted coupons are dropped here rather than in SQL: Prisma cannot
    // compare two columns in a where clause, and the advertised set is tiny.
    // The remaining rows are re-projected field by field so that adding a
    // column to the select above can never leak it to the storefront.
    return rows
      .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
      .map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        description: c.description,
        type: c.type,
        value: c.value,
        minOrder: c.minOrder,
        maxDiscount: c.maxDiscount,
        expiresAt: c.expiresAt,
        scope: c.scope,
      }));
  }

  async listCoupons(query: ListCouponsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const now = new Date();
    const where: Prisma.CouponWhereInput = {};

    if (query.search) {
      const q = query.search.trim();
      // Searching a coupon list means searching what is on screen, and the list
      // shows a name as well as a code.
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (query.status === 'active') where.active = true;
    if (query.status === 'inactive') where.active = false;
    if (query.status === 'expired') where.expiresAt = { lt: now };
    if (query.status === 'scheduled') where.startsAt = { gt: now };
    if (query.scope) where.scope = query.scope;
    if (query.type) where.type = query.type;
    if (query.batchId) where.batchId = query.batchId;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.coupon.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: { select: { products: true, categories: true } },
        },
      }),
      this.prisma.coupon.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  /** Distinct generated batches, newest first, for the batch filter. */
  async listCouponBatches() {
    const rows = await this.prisma.coupon.groupBy({
      by: ['batchId'],
      where: { batchId: { not: null } },
      _count: { _all: true },
      _min: { createdAt: true, name: true },
      orderBy: { _min: { createdAt: 'desc' } },
    });
    return rows
      .filter((r): r is typeof r & { batchId: string } => r.batchId !== null)
      .map((r) => ({
        batchId: r.batchId,
        count: r._count._all,
        name: r._min.name,
        createdAt: r._min.createdAt,
      }));
  }

  /**
   * One coupon, with its scope targets hydrated into names the editor can show
   * (an id list would make the form unreadable).
   */
  async getCoupon(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            productId: true,
            product: { select: { title: true, slug: true } },
          },
        },
        categories: {
          select: {
            categoryId: true,
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
    if (!coupon) throw new NotFoundException('Coupon not found');
    return coupon;
  }

  async updateCoupon(id: string, dto: UpdateCouponDto, actorId: number | null) {
    await this.getCoupon(id); // 404 if missing
    const data: Prisma.CouponUpdateInput = {};
    if (dto.code !== undefined) {
      const code = dto.code.trim().toUpperCase();
      await this.assertCodeAvailable(code, id);
      data.code = code;
    }
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.value !== undefined) data.value = dto.value;
    if (dto.minOrder !== undefined) data.minOrder = dto.minOrder;
    if (dto.maxDiscount !== undefined) data.maxDiscount = dto.maxDiscount;
    if (dto.usageLimit !== undefined) data.usageLimit = dto.usageLimit;
    if (dto.perCustomerLimit !== undefined) {
      data.perCustomerLimit = dto.perCustomerLimit;
    }
    if (dto.startsAt !== undefined) {
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    }
    if (dto.expiresAt !== undefined) {
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    }
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.isPublic !== undefined) data.isPublic = dto.isPublic;
    if (dto.appliesToSaleItems !== undefined) {
      data.appliesToSaleItems = dto.appliesToSaleItems;
    }
    if (dto.scope !== undefined) {
      this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);
      data.scope = dto.scope;
    }

    // Scope targets are REPLACED, not merged: the editor always sends the full
    // list it is showing, so a merge would make removing a target impossible.
    if (dto.productIds !== undefined) {
      data.products = {
        deleteMany: {},
        create: dto.productIds.map((productId) => ({ productId })),
      };
    }
    if (dto.categoryIds !== undefined) {
      data.categories = {
        deleteMany: {},
        create: dto.categoryIds.map((categoryId) => ({ categoryId })),
      };
    }

    try {
      const coupon = await this.prisma.coupon.update({ where: { id }, data });
      await this.audit.record({
        actorId,
        action: 'coupon.update',
        entityType: 'Coupon',
        entityId: id,
        metadata: { fields: Object.keys(data) },
      });
      return coupon;
    } catch (err) {
      throw this.mapUniqueError(err, dto.code ?? '');
    }
  }

  async toggleCoupon(id: string, actorId: number | null) {
    const coupon = await this.getCoupon(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { active: !coupon.active },
    });
    await this.audit.record({
      actorId,
      action: 'coupon.toggle',
      entityType: 'Coupon',
      entityId: id,
      metadata: { active: updated.active },
    });
    return updated;
  }

  async deleteCoupon(id: string, actorId: number | null) {
    await this.getCoupon(id);
    await this.prisma.coupon.delete({ where: { id } }); // cascades redemptions
    await this.audit.record({
      actorId,
      action: 'coupon.delete',
      entityType: 'Coupon',
      entityId: id,
    });
    return { id, deleted: true };
  }

  /** Redemption history + count for a coupon (FR-605 detail view). */
  async getRedemptions(id: string) {
    await this.getCoupon(id);
    const redemptions = await this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, email: true } },
        order: { select: { id: true, orderNumber: true, grandTotal: true } },
      },
    });
    return { count: redemptions.length, redemptions };
  }

  /**
   * Lightweight coupon analytics (FR-605): redemptions, discount given, and
   * revenue attributed to orders that used the coupon. The heavier time-series
   * aggregate lands with the analytics dashboard (script 15).
   */
  async getCouponAnalytics(id: string) {
    const coupon = await this.getCoupon(id);
    const redemptions = await this.prisma.couponRedemption.findMany({
      where: { couponId: id },
      include: { order: { select: { grandTotal: true } } },
    });
    const redemptionCount = redemptions.length;
    const totalDiscountCents = redemptions.reduce(
      (sum, r) => sum + r.discountCents,
      0,
    );
    const attributedRevenueCents = redemptions.reduce(
      (sum, r) => sum + (r.order?.grandTotal ?? 0),
      0,
    );
    const averageOrderValueCents = redemptionCount
      ? Math.round(attributedRevenueCents / redemptionCount)
      : 0;
    return {
      couponId: coupon.id,
      code: coupon.code,
      redemptionCount,
      totalDiscountCents,
      attributedRevenueCents,
      averageOrderValueCents,
    };
  }

  // ─────────────────────────── Admin: automatic discounts ────────────────────

  async createAutomaticDiscount(
    dto: CreateAutomaticDiscountDto,
    actorId: number | null,
  ) {
    this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);
    const discount = await this.prisma.automaticDiscount.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        rule: dto.rule as unknown as Prisma.InputJsonValue,
        priority: dto.priority ?? 0,
        status: dto.status ?? DiscountStatus.ACTIVE,
        startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
        scope: dto.scope ?? PromotionScope.ALL,
        appliesToSaleItems: dto.appliesToSaleItems ?? true,
        products: {
          create: (dto.productIds ?? []).map((productId) => ({ productId })),
        },
        categories: {
          create: (dto.categoryIds ?? []).map((categoryId) => ({ categoryId })),
        },
      },
      include: SCOPE_INCLUDE,
    });
    await this.audit.record({
      actorId,
      action: 'automatic-discount.create',
      entityType: 'AutomaticDiscount',
      entityId: discount.id,
      metadata: { name: discount.name },
    });
    return discount;
  }

  listAutomaticDiscounts() {
    return this.prisma.automaticDiscount.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { products: true, categories: true } } },
    });
  }

  /** Public: active in-window automatic discounts (storefront promo display). */
  async listActiveAutomaticDiscounts() {
    const now = new Date();
    const rows = await this.prisma.automaticDiscount.findMany({
      where: {
        status: DiscountStatus.ACTIVE,
        AND: [
          { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
          { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
        ],
      },
      orderBy: { priority: 'desc' },
      select: { id: true, name: true, rule: true },
    });
    return rows;
  }

  async getAutomaticDiscount(id: string) {
    const discount = await this.prisma.automaticDiscount.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            productId: true,
            product: { select: { title: true, slug: true } },
          },
        },
        categories: {
          select: {
            categoryId: true,
            category: { select: { name: true, slug: true } },
          },
        },
      },
    });
    if (!discount) throw new NotFoundException('Automatic discount not found');
    return discount;
  }

  async updateAutomaticDiscount(
    id: string,
    dto: UpdateAutomaticDiscountDto,
    actorId: number | null,
  ) {
    await this.getAutomaticDiscount(id);
    const data: Prisma.AutomaticDiscountUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.rule !== undefined) {
      data.rule = dto.rule as unknown as Prisma.InputJsonValue;
    }
    if (dto.priority !== undefined) data.priority = dto.priority;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.startsAt !== undefined) {
      data.startsAt = dto.startsAt ? new Date(dto.startsAt) : null;
    }
    if (dto.endsAt !== undefined) {
      data.endsAt = dto.endsAt ? new Date(dto.endsAt) : null;
    }
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.appliesToSaleItems !== undefined) {
      data.appliesToSaleItems = dto.appliesToSaleItems;
    }
    if (dto.scope !== undefined) {
      this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);
      data.scope = dto.scope;
    }
    // Replaced wholesale, for the same reason as on a coupon.
    if (dto.productIds !== undefined) {
      data.products = {
        deleteMany: {},
        create: dto.productIds.map((productId) => ({ productId })),
      };
    }
    if (dto.categoryIds !== undefined) {
      data.categories = {
        deleteMany: {},
        create: dto.categoryIds.map((categoryId) => ({ categoryId })),
      };
    }
    const discount = await this.prisma.automaticDiscount.update({
      where: { id },
      data,
    });
    await this.audit.record({
      actorId,
      action: 'automatic-discount.update',
      entityType: 'AutomaticDiscount',
      entityId: id,
      metadata: { fields: Object.keys(data) },
    });
    return discount;
  }

  async deleteAutomaticDiscount(id: string, actorId: number | null) {
    await this.getAutomaticDiscount(id);
    await this.prisma.automaticDiscount.delete({ where: { id } });
    await this.audit.record({
      actorId,
      action: 'automatic-discount.delete',
      entityType: 'AutomaticDiscount',
      entityId: id,
    });
    return { id, deleted: true };
  }

  // ─────────────────────────── Admin: sale pricing (FR-604) ───────────────────

  /**
   * Set (or clear) a scheduled sale on every variant of a product. With
   * `percentOff` each variant's sale price is derived from its own regular price;
   * with `salePriceCents` all variants share that flat sale price. Omitting both
   * clears the sale.
   */
  async setSalePrice(
    productId: string,
    dto: SetSalePriceDto,
    actorId: number | null,
  ) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { select: { id: true, price: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (product.variants.length === 0) {
      throw new BadRequestException('Product has no variants to put on sale.');
    }

    const clearing = dto.percentOff == null && dto.salePriceCents == null;
    const startsAt = dto.saleStartsAt ? new Date(dto.saleStartsAt) : null;
    const endsAt = dto.saleEndsAt ? new Date(dto.saleEndsAt) : null;
    if (startsAt && endsAt && startsAt > endsAt) {
      throw new BadRequestException('Sale start must be before its end.');
    }

    await this.prisma.$transaction(
      product.variants.map((v) => {
        const salePrice = clearing
          ? null
          : dto.percentOff != null
            ? Math.max(0, Math.round((v.price * (100 - dto.percentOff)) / 100))
            : (dto.salePriceCents as number);
        return this.prisma.productVariant.update({
          where: { id: v.id },
          data: {
            salePrice,
            saleStartsAt: clearing ? null : startsAt,
            saleEndsAt: clearing ? null : endsAt,
          },
        });
      }),
    );

    await this.audit.record({
      actorId,
      action: clearing ? 'product.sale.clear' : 'product.sale.set',
      entityType: 'Product',
      entityId: productId,
      metadata: clearing
        ? {}
        : {
            percentOff: dto.percentOff ?? null,
            salePriceCents: dto.salePriceCents ?? null,
            startsAt: startsAt?.toISOString() ?? null,
            endsAt: endsAt?.toISOString() ?? null,
          },
    });

    return {
      productId,
      variantsUpdated: product.variants.length,
      cleared: clearing,
    };
  }

  async clearSalePrice(productId: string, actorId: number | null) {
    return this.setSalePrice(productId, {}, actorId);
  }

  /**
   * Run a sale across many products at once (script 18).
   *
   * The per-product endpoint above is the right shape for editing ONE product,
   * and completely the wrong shape for "20% off every laptop for the weekend" —
   * which is what a seasonal sale actually is. This takes the same scope
   * vocabulary as coupons and discounts (ALL / CATEGORY / PRODUCT), resolves it
   * to a product set, and writes the sale onto every variant of every match.
   *
   * percentOff derives each variant's sale price from its OWN regular price, so
   * a mixed-price selection keeps its price relationships. salePriceCents flattens
   * every variant to the same number, which is only sensible for a hand-picked
   * set — the DTO permits both and the admin UI steers toward percentOff.
   *
   * ALL is deliberately limited to ACTIVE products: nobody means "and the
   * archived ones too" by "everything".
   */
  async applyBulkSale(dto: BulkSaleDto, actorId: number | null) {
    this.assertScopeTargets(dto.scope, dto.productIds, dto.categoryIds);

    const clearing =
      dto.clear === true ||
      (dto.percentOff == null && dto.salePriceCents == null);
    const startsAt = dto.saleStartsAt ? new Date(dto.saleStartsAt) : null;
    const endsAt = dto.saleEndsAt ? new Date(dto.saleEndsAt) : null;
    if (startsAt && endsAt && startsAt > endsAt) {
      throw new BadRequestException('Sale start must be before its end.');
    }

    const where = await this.saleTargetWhere(dto);
    const products = await this.prisma.product.findMany({
      where,
      select: { id: true, variants: { select: { id: true, price: true } } },
    });
    const variants = products.flatMap((p) => p.variants);
    if (variants.length === 0) {
      throw new BadRequestException(
        'That selection contains no product variants to put on sale.',
      );
    }

    // updateMany can't derive a per-row value, so a percentage sale needs one
    // update per variant. They are grouped into chunked transactions so a
    // catalog-wide sale is still atomic per chunk and doesn't open one
    // transaction with thousands of statements.
    const CHUNK = 200;
    for (let i = 0; i < variants.length; i += CHUNK) {
      const chunk = variants.slice(i, i + CHUNK);
      await this.prisma.$transaction(
        chunk.map((v) =>
          this.prisma.productVariant.update({
            where: { id: v.id },
            data: {
              salePrice: clearing
                ? null
                : dto.percentOff != null
                  ? Math.max(
                      0,
                      Math.round((v.price * (100 - dto.percentOff)) / 100),
                    )
                  : (dto.salePriceCents as number),
              saleStartsAt: clearing ? null : startsAt,
              saleEndsAt: clearing ? null : endsAt,
            },
          }),
        ),
      );
    }

    await this.audit.record({
      actorId,
      action: clearing ? 'product.sale.bulk.clear' : 'product.sale.bulk.set',
      entityType: 'Product',
      entityId: 'bulk',
      metadata: {
        scope: dto.scope ?? PromotionScope.ALL,
        products: products.length,
        variants: variants.length,
        percentOff: dto.percentOff ?? null,
        salePriceCents: dto.salePriceCents ?? null,
        startsAt: startsAt?.toISOString() ?? null,
        endsAt: endsAt?.toISOString() ?? null,
      },
    });

    return {
      cleared: clearing,
      productsUpdated: products.length,
      variantsUpdated: variants.length,
    };
  }

  /**
   * How many products/variants a bulk sale would touch, without touching them.
   * The admin form calls this as the scope changes so the confirm button can say
   * "Apply to 34 products" instead of asking for blind faith.
   */
  async previewBulkSale(dto: BulkSaleDto) {
    const where = await this.saleTargetWhere(dto);
    const [products, variants] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.productVariant.count({ where: { product: where } }),
    ]);
    return { products, variants };
  }

  /** Product predicate behind a bulk sale's scope. */
  private async saleTargetWhere(
    dto: BulkSaleDto,
  ): Promise<Prisma.ProductWhereInput> {
    const scope = dto.scope ?? PromotionScope.ALL;
    if (scope === PromotionScope.PRODUCT) {
      return { id: { in: dto.productIds ?? [] } };
    }
    if (scope === PromotionScope.CATEGORY) {
      const ids = await this.categories.descendantIds(dto.categoryIds ?? []);
      return { categoryId: { in: ids } };
    }
    return { status: ProductStatus.ACTIVE };
  }

  // ─────────────────────────── Internals ───────────────────────────

  /**
   * A CATEGORY- or PRODUCT-scoped promotion with no targets would silently
   * discount nothing (or, worse in a bulk sale, everything). Rejecting it at
   * the boundary keeps that from ever reaching the database.
   */
  private assertScopeTargets(
    scope: PromotionScope | undefined,
    productIds: string[] | undefined,
    categoryIds: string[] | undefined,
  ): void {
    if (scope === PromotionScope.PRODUCT && (productIds ?? []).length === 0) {
      throw new BadRequestException('Select at least one product.');
    }
    if (scope === PromotionScope.CATEGORY && (categoryIds ?? []).length === 0) {
      throw new BadRequestException('Select at least one category.');
    }
  }

  private async assertCodeAvailable(
    code: string,
    exceptId?: string,
  ): Promise<void> {
    const existing = await this.prisma.coupon.findFirst({
      where: {
        code: { equals: code, mode: 'insensitive' },
        ...(exceptId ? { NOT: { id: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException(`Coupon code "${code}" already exists.`);
    }
  }

  private mapUniqueError(err: unknown, code: string): unknown {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return new ConflictException(`Coupon code "${code}" already exists.`);
    }
    return err;
  }

  private dollars(cents: number): string {
    return `$${(cents / 100).toFixed(2)}`;
  }
}
