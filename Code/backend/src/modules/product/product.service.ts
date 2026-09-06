import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { AuditService } from '../audit/audit.service';
import { SearchService } from '../search/search.service';
import {
  compareAtWhenOnSale,
  effectivePriceCents,
  isSaleActive,
} from '../coupon/sale-pricing';
import { ensureUniqueSlug, slugify } from '../../common/utils/slug.util';
import {
  ListProductsDto,
  ProductSort,
  StockFilter,
} from './dto/list-products.dto';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { BulkAction, BulkUpdateDto } from './dto/bulk-update.dto';
import { SetImagesDto } from './dto/set-images.dto';
import { UpdateSeoDto } from './dto/update-seo.dto';
import { VariantInputDto } from './dto/variant.dto';
import { MAX_AXES, MAX_VARIANTS } from './dto/product.constants';

/** Full product shape for the detail endpoints + editor. */
const DETAIL_INCLUDE = Prisma.validator<Prisma.ProductInclude>()({
  images: { orderBy: { position: 'asc' } },
  variants: { orderBy: { price: 'asc' } },
  category: true,
  brand: true,
  productTags: { include: { tag: true } },
});

/** Lightweight shape for list rows (primary image + price range). */
const LIST_INCLUDE = Prisma.validator<Prisma.ProductInclude>()({
  images: { orderBy: { position: 'asc' }, take: 1 },
  variants: {
    select: {
      price: true,
      salePrice: true,
      saleStartsAt: true,
      saleEndsAt: true,
    },
  },
  category: { select: { id: true, name: true, slug: true } },
});

type ListRow = Prisma.ProductGetPayload<{ include: typeof LIST_INCLUDE }>;

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
    private readonly search: SearchService,
  ) {}

  // Best-effort search reindex hooks (FR-220). No-ops for the Postgres provider
  // (the tsvector is trigger-maintained), but calling them keeps the interface
  // honest for a future external search engine. Never awaited on the write path.
  private reindex(productId: string): void {
    void this.search.indexProduct(productId);
  }
  private deindex(productId: string): void {
    void this.search.removeProduct(productId);
  }

  // ─────────────────────────── Variant matrix (pure) ───────────────────────────

  /**
   * Validate a product's option axes against its variants (unit-tested).
   *
   * Rules (FR-201..205):
   *  - ≤ {@link MAX_AXES} axes; axes are non-empty and unique.
   *  - ≤ {@link MAX_VARIANTS} total combinations.
   *  - every variant's `options` keys match the axis set exactly (no unknown /
   *    missing axis), values are non-empty.
   *  - no two variants share the same option combination.
   *
   * When `axes` is omitted it is inferred from the variants' option keys (first
   * seen order). Returns the normalized axis list. Throws `BadRequestException`
   * on any violation. An empty variant list is valid (a draft with no variants).
   */
  validateVariantMatrix(
    axes: string[] | undefined,
    variants: VariantInputDto[],
  ): { axes: string[] } {
    if (variants.length === 0) return { axes: axes ?? [] };

    // Derive axes if not declared.
    let resolvedAxes: string[];
    if (axes && axes.length > 0) {
      resolvedAxes = axes.map((a) => a.trim());
    } else {
      const seen = new Set<string>();
      resolvedAxes = [];
      for (const v of variants) {
        for (const key of Object.keys(v.options ?? {})) {
          if (!seen.has(key)) {
            seen.add(key);
            resolvedAxes.push(key);
          }
        }
      }
    }

    // Axis sanity.
    if (resolvedAxes.some((a) => a.length === 0)) {
      throw new BadRequestException('Axis names must be non-empty.');
    }
    if (new Set(resolvedAxes).size !== resolvedAxes.length) {
      throw new BadRequestException('Axis names must be unique.');
    }
    if (resolvedAxes.length > MAX_AXES) {
      throw new BadRequestException(
        `A product may declare at most ${MAX_AXES} option axes.`,
      );
    }
    if (variants.length > MAX_VARIANTS) {
      throw new BadRequestException(
        `A product may have at most ${MAX_VARIANTS} variants.`,
      );
    }

    const axisSet = new Set(resolvedAxes);
    const combos = new Set<string>();

    for (const v of variants) {
      const options = v.options ?? {};
      const keys = Object.keys(options);

      if (keys.length !== resolvedAxes.length) {
        throw new BadRequestException(
          `Each variant must specify exactly the declared axes: ${resolvedAxes.join(', ')}.`,
        );
      }
      for (const key of keys) {
        if (!axisSet.has(key)) {
          throw new BadRequestException(`Unknown option axis "${key}".`);
        }
        const value = options[key];
        if (typeof value !== 'string' || value.trim().length === 0) {
          throw new BadRequestException(
            `Option "${key}" must have a non-empty value.`,
          );
        }
      }

      // Canonical signature (axis order fixed) → duplicate detection.
      const signature = resolvedAxes.map((a) => `${a}=${options[a]}`).join('|');
      if (combos.has(signature)) {
        throw new BadRequestException(
          `Duplicate variant combination: ${signature}.`,
        );
      }
      combos.add(signature);
    }

    return { axes: resolvedAxes };
  }

  // ─────────────────────────── Public reads ───────────────────────────

  /** Paginated listing. Public callers are forced to ACTIVE-only. */
  async list(dto: ListProductsDto, isAdmin: boolean) {
    const categoryIds = await this.resolveCategoryScope(
      dto.categorySlug,
      dto.categoryId,
    );
    // Only the "low stock" filter needs the store threshold, so only that
    // filter pays for the extra read.
    const lowStockThreshold =
      isAdmin && dto.stock === StockFilter.LOW
        ? await this.lowStockThreshold()
        : undefined;
    const where = this.buildProductWhere(
      dto,
      isAdmin,
      categoryIds,
      lowStockThreshold,
    );
    const page = dto.page ?? 1;
    const pageSize = dto.pageSize ?? 24;
    const skip = (page - 1) * pageSize;

    const total = await this.prisma.product.count({ where });

    let rows: ListRow[];
    if (
      dto.sort === ProductSort.PRICE_ASC ||
      dto.sort === ProductSort.PRICE_DESC
    ) {
      rows = await this.listByPrice(
        dto,
        isAdmin,
        skip,
        pageSize,
        categoryIds,
        lowStockThreshold,
      );
    } else {
      // Featured feed (script 14) orders by the denormalized aggregate rating,
      // then recency; otherwise the requested sort applies.
      const orderBy: Prisma.ProductOrderByWithRelationInput[] = dto.featured
        ? [
            { ratingAverage: 'desc' },
            { ratingCount: 'desc' },
            { createdAt: 'desc' },
          ]
        : [this.orderByFor(dto.sort)];
      rows = await this.prisma.product.findMany({
        where,
        include: LIST_INCLUDE,
        orderBy,
        skip,
        take: pageSize,
      });
    }

    return {
      items: rows.map((r) => this.toListItem(r)),
      page,
      pageSize,
      total,
    };
  }

  /**
   * Lightweight feed of every publicly-visible (ACTIVE) product for the
   * storefront `sitemap.ts` (script 17, NFR-702). Slug + updatedAt only, so it
   * stays cheap even as the catalog grows and isn't bounded by list paging.
   */
  sitemapEntries(): Promise<{ slug: string; updatedAt: Date }[]> {
    return this.prisma.product.findMany({
      where: { status: ProductStatus.ACTIVE },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /** Full product by slug. 404 for non-ACTIVE to public callers. */
  async getBySlug(slug: string, isAdmin: boolean) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      include: DETAIL_INCLUDE,
    });
    if (!product || (!isAdmin && product.status !== ProductStatus.ACTIVE)) {
      throw new NotFoundException('Product not found');
    }
    return this.decorateDetail(product);
  }

  /** Full product by id (admin editor). */
  async getById(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!product) throw new NotFoundException('Product not found');
    return this.decorateDetail(product);
  }

  /**
   * Hydrate a list of product ids into list cards, preserving the input order
   * and dropping any that are missing or (for public callers) not ACTIVE. Used
   * by recently-viewed (script 08) and future card strips.
   */
  async getCardsByIds(ids: string[], isAdmin = false) {
    if (ids.length === 0) return [];
    const where: Prisma.ProductWhereInput = { id: { in: ids } };
    if (!isAdmin) where.status = ProductStatus.ACTIVE;

    const rows = await this.prisma.product.findMany({
      where,
      include: LIST_INCLUDE,
    });
    const byId = new Map(rows.map((r) => [r.id, this.toListItem(r)]));
    return ids
      .map((id) => byId.get(id))
      .filter((c): c is ReturnType<ProductService['toListItem']> => !!c);
  }

  // ─────────────────────────── Admin mutations ───────────────────────────

  async create(dto: CreateProductDto, actorId?: number) {
    const variants = dto.variants ?? [];
    this.validateVariantMatrix(dto.axes, variants);
    await this.assertCategory(dto.categoryId);
    await this.assertTags(dto.tagIds);

    const slug = await ensureUniqueSlug(dto.slug || dto.title, (s) =>
      this.slugTaken(s),
    );
    const variantData = await this.buildVariantCreateData(slug, variants);

    const product = await this.prisma.$transaction(async (tx) => {
      const created = await tx.product.create({
        data: {
          title: dto.title,
          slug,
          description: dto.description ?? null,
          status: dto.status ?? ProductStatus.DRAFT,
          categoryId: dto.categoryId ?? null,
          brandId: dto.brandId ?? null,
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          ogImage: dto.ogImage ?? null,
          canonicalUrl: dto.canonicalUrl ?? null,
          variants: variantData.length ? { create: variantData } : undefined,
          productTags: dto.tagIds?.length
            ? { create: dto.tagIds.map((tagId) => ({ tagId })) }
            : undefined,
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit.record(
        {
          actorId,
          action: 'product.create',
          entityType: 'Product',
          entityId: created.id,
          metadata: { title: created.title, slug: created.slug },
        },
        tx,
      );
      return created;
    });

    this.reindex(product.id);
    return this.decorateDetail(product);
  }

  async update(id: string, dto: UpdateProductDto, actorId?: number) {
    const existing = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, slug: true, title: true },
    });
    if (!existing) throw new NotFoundException('Product not found');

    if (dto.variants) this.validateVariantMatrix(dto.axes, dto.variants);
    if (dto.categoryId) await this.assertCategory(dto.categoryId);
    if (dto.tagIds) await this.assertTags(dto.tagIds);

    // Slug only changes when explicitly supplied (keeps existing URLs stable).
    let slug = existing.slug;
    if (dto.slug && slugify(dto.slug) !== existing.slug) {
      slug = await ensureUniqueSlug(dto.slug, (s) => this.slugTaken(s, id));
    }

    const data: Prisma.ProductUpdateInput = { slug };
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.metaTitle !== undefined) data.metaTitle = dto.metaTitle;
    if (dto.metaDescription !== undefined)
      data.metaDescription = dto.metaDescription;
    if (dto.ogImage !== undefined) data.ogImage = dto.ogImage;
    if (dto.canonicalUrl !== undefined) data.canonicalUrl = dto.canonicalUrl;
    if (dto.categoryId !== undefined) {
      data.category = dto.categoryId
        ? { connect: { id: dto.categoryId } }
        : { disconnect: true };
    }
    if (dto.brandId !== undefined) {
      data.brand = dto.brandId
        ? { connect: { id: dto.brandId } }
        : { disconnect: true };
    }

    // Variant rows need SKUs generated before the transaction.
    const variantData = dto.variants
      ? await this.buildVariantCreateData(slug, dto.variants)
      : null;

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.product.update({ where: { id }, data });

      if (variantData) {
        await tx.productVariant.deleteMany({ where: { productId: id } });
        if (variantData.length) {
          await tx.productVariant.createMany({
            data: variantData.map((v) => ({ ...v, productId: id })),
          });
        }
      }

      if (dto.tagIds) {
        await tx.productTag.deleteMany({ where: { productId: id } });
        if (dto.tagIds.length) {
          await tx.productTag.createMany({
            data: dto.tagIds.map((tagId) => ({ productId: id, tagId })),
            skipDuplicates: true,
          });
        }
      }

      await this.audit.record(
        {
          actorId,
          action: 'product.update',
          entityType: 'Product',
          entityId: id,
          metadata: { fields: Object.keys(dto) },
        },
        tx,
      );

      return tx.product.findUniqueOrThrow({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });

    this.reindex(id);
    return this.decorateDetail(product);
  }

  async remove(id: string, actorId?: number) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true, images: { select: { cloudinaryPublicId: true } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.$transaction(async (tx) => {
      // Cascades remove variants, images, and productTags (schema onDelete).
      await tx.product.delete({ where: { id } });
      await this.audit.record(
        {
          actorId,
          action: 'product.delete',
          entityType: 'Product',
          entityId: id,
        },
        tx,
      );
    });

    // Best-effort Cloudinary cleanup (never blocks the delete).
    await this.cleanupImages(product.images.map((i) => i.cloudinaryPublicId));

    this.deindex(id);
    return { id, deleted: true };
  }

  async duplicate(id: string, actorId?: number) {
    const source = await this.prisma.product.findUnique({
      where: { id },
      include: DETAIL_INCLUDE,
    });
    if (!source) throw new NotFoundException('Product not found');

    const slug = await ensureUniqueSlug(`${source.title}-copy`, (s) =>
      this.slugTaken(s),
    );

    // Fresh unique SKUs for the copied variants.
    const taken = new Set<string>();
    const variantData: Prisma.ProductVariantCreateWithoutProductInput[] = [];
    for (const v of source.variants) {
      const optionSuffix = Object.values(
        (v.options as Record<string, string>) ?? {},
      ).join('-');
      variantData.push({
        sku: await this.buildSku(`${slug}-${optionSuffix}`, taken),
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock,
        weightGrams: v.weightGrams,
        barcode: v.barcode,
        options: v.options as Prisma.InputJsonValue,
      });
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const copy = await tx.product.create({
        data: {
          title: `${source.title} (copy)`,
          slug,
          description: source.description,
          status: ProductStatus.DRAFT, // copies always start as drafts
          categoryId: source.categoryId,
          brandId: source.brandId,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
          ogImage: source.ogImage,
          canonicalUrl: null, // canonical is per-URL — don't clone
          variants: variantData.length ? { create: variantData } : undefined,
          images: source.images.length
            ? {
                create: source.images.map((img) => ({
                  cloudinaryPublicId: img.cloudinaryPublicId,
                  url: img.url,
                  alt: img.alt,
                  position: img.position,
                  width: img.width,
                  height: img.height,
                })),
              }
            : undefined,
          productTags: source.productTags.length
            ? {
                create: source.productTags.map((pt) => ({ tagId: pt.tagId })),
              }
            : undefined,
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit.record(
        {
          actorId,
          action: 'product.duplicate',
          entityType: 'Product',
          entityId: copy.id,
          metadata: { sourceId: id },
        },
        tx,
      );
      return copy;
    });

    this.reindex(created.id);
    return this.decorateDetail(created);
  }

  async bulk(dto: BulkUpdateDto, actorId?: number) {
    if (dto.action === BulkAction.SET_PRICE && dto.value == null) {
      throw new BadRequestException(
        '`value` (cents) is required for setPrice.',
      );
    }

    const products = await this.prisma.product.findMany({
      where: { id: { in: dto.ids } },
      select: { id: true, images: { select: { cloudinaryPublicId: true } } },
    });
    const foundIds = products.map((p) => p.id);
    if (foundIds.length === 0) {
      throw new NotFoundException('No matching products found.');
    }

    await this.prisma.$transaction(async (tx) => {
      switch (dto.action) {
        case BulkAction.ACTIVATE:
          await tx.product.updateMany({
            where: { id: { in: foundIds } },
            data: { status: ProductStatus.ACTIVE },
          });
          break;
        case BulkAction.ARCHIVE:
          await tx.product.updateMany({
            where: { id: { in: foundIds } },
            data: { status: ProductStatus.ARCHIVED },
          });
          break;
        case BulkAction.SET_PRICE:
          await tx.productVariant.updateMany({
            where: { productId: { in: foundIds } },
            data: { price: dto.value! },
          });
          break;
        case BulkAction.DELETE:
          await tx.product.deleteMany({ where: { id: { in: foundIds } } });
          break;
      }

      await Promise.all(
        foundIds.map((entityId) =>
          this.audit.record(
            {
              actorId,
              action: `product.bulk.${dto.action}`,
              entityType: 'Product',
              entityId,
              metadata: dto.value != null ? { value: dto.value } : undefined,
            },
            tx,
          ),
        ),
      );
    });

    if (dto.action === BulkAction.DELETE) {
      await this.cleanupImages(
        products.flatMap((p) => p.images.map((i) => i.cloudinaryPublicId)),
      );
      foundIds.forEach((id) => this.deindex(id));
    } else {
      foundIds.forEach((id) => this.reindex(id));
    }

    return { action: dto.action, affected: foundIds.length, ids: foundIds };
  }

  async updateSeo(id: string, dto: UpdateSeoDto, actorId?: number) {
    await this.assertProductExists(id);
    const product = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          metaTitle: dto.metaTitle ?? null,
          metaDescription: dto.metaDescription ?? null,
          ogImage: dto.ogImage ?? null,
          canonicalUrl: dto.canonicalUrl ?? null,
        },
        include: DETAIL_INCLUDE,
      });
      await this.audit.record(
        {
          actorId,
          action: 'product.updateSeo',
          entityType: 'Product',
          entityId: id,
        },
        tx,
      );
      return updated;
    });
    return this.decorateDetail(product);
  }

  /** Replace the ordered image set for a product (persists order + alt text). */
  async setImages(id: string, dto: SetImagesDto, actorId?: number) {
    await this.assertProductExists(id);

    const product = await this.prisma.$transaction(async (tx) => {
      await tx.productImage.deleteMany({ where: { productId: id } });
      if (dto.images.length) {
        await tx.productImage.createMany({
          data: dto.images.map((img) => ({
            productId: id,
            cloudinaryPublicId: img.publicId,
            url: img.url,
            alt: img.alt ?? null,
            position: img.position,
            width: img.width ?? null,
            height: img.height ?? null,
          })),
        });
      }
      await this.audit.record(
        {
          actorId,
          action: 'product.setImages',
          entityType: 'Product',
          entityId: id,
          metadata: { count: dto.images.length },
        },
        tx,
      );
      return tx.product.findUniqueOrThrow({
        where: { id },
        include: DETAIL_INCLUDE,
      });
    });

    return this.decorateDetail(product);
  }

  // ─────────────────────────── helpers ───────────────────────────

  /**
   * Expand a category slug to that category AND every descendant id.
   *
   * Products hang off leaf categories ("Laptops"), but shoppers navigate and
   * link to branches ("Computers") — from the mega-menu, the homepage rails and
   * the category poster tiles. Matching the slug exactly made every branch page
   * report "0 products", which is wrong: a category listing means "everything
   * filed under here".
   *
   * The whole table is read because it is small and bounded (MAX_CATEGORY_DEPTH
   * is 3), which keeps this to one query instead of one per level.
   *
   * Returns undefined when no slug was requested (no category filter at all),
   * and an empty array when the slug matches nothing (so the caller yields zero
   * rows rather than silently dropping the filter).
   */
  private async resolveCategoryScope(
    slug?: string,
    id?: string,
  ): Promise<string[] | undefined> {
    if (!slug && !id) return undefined;

    const all = await this.prisma.category.findMany({
      select: { id: true, slug: true, parentId: true },
    });

    // `id` wins when both are supplied — it is the more precise handle, and the
    // admin picker always sends ids.
    const root = id
      ? all.find((c) => c.id === id)
      : all.find((c) => c.slug === slug);
    if (!root) return [];

    const childrenOf = new Map<string, string[]>();
    for (const c of all) {
      if (!c.parentId) continue;
      const bucket = childrenOf.get(c.parentId) ?? [];
      bucket.push(c.id);
      childrenOf.set(c.parentId, bucket);
    }

    const ids: string[] = [];
    const queue = [root.id];
    while (queue.length > 0) {
      const id = queue.shift()!;
      ids.push(id);
      queue.push(...(childrenOf.get(id) ?? []));
    }
    return ids;
  }

  private buildProductWhere(
    dto: ListProductsDto,
    isAdmin: boolean,
    categoryIds?: string[],
    lowStockThreshold?: number,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    // Public callers see ACTIVE only, regardless of any status query param.
    if (!isAdmin) where.status = ProductStatus.ACTIVE;
    else if (dto.status) where.status = dto.status;

    // `categoryIds` is the requested category PLUS its descendants, resolved by
    // resolveCategoryScope. An empty array means the slug matched nothing, which
    // must yield zero results — `{ in: [] }` does exactly that.
    if (categoryIds) where.categoryId = { in: categoryIds };
    else if (isAdmin && dto.uncategorized) where.categoryId = null;

    if (dto.brandId) where.brandId = dto.brandId;
    if (dto.tag) where.productTags = { some: { tag: { slug: dto.tag } } };
    if (dto.search) where.title = { contains: dto.search, mode: 'insensitive' };

    if (dto.createdFrom || dto.createdTo) {
      where.createdAt = {
        gte: dto.createdFrom ? new Date(dto.createdFrom) : undefined,
        lte: dto.createdTo ? new Date(dto.createdTo) : undefined,
      };
    }

    // Variant-level predicates share ONE `variants.some` clause, because two
    // separate `some` blocks would let different variants satisfy each half —
    // "under $50 and in stock" would match a product with a cheap sold-out
    // variant and an expensive stocked one. Combining them forces a single
    // variant to satisfy every condition, which is what the filter means.
    const variantWhere: Prisma.ProductVariantWhereInput = {};
    if (dto.minPrice != null || dto.maxPrice != null) {
      variantWhere.price = {
        gte: dto.minPrice ?? undefined,
        lte: dto.maxPrice ?? undefined,
      };
    }
    if (isAdmin && dto.onSale) variantWhere.salePrice = { not: null };
    if (isAdmin && dto.stock === StockFilter.IN) variantWhere.stock = { gt: 0 };
    if (isAdmin && dto.stock === StockFilter.LOW) {
      variantWhere.stock = { gt: 0, lte: lowStockThreshold ?? 5 };
    }
    if (Object.keys(variantWhere).length > 0)
      where.variants = { some: variantWhere };

    // "Out of stock" is the one case that is NOT a `some` — it means EVERY
    // variant is at zero, so it has to be expressed as "no variant has stock".
    if (isAdmin && dto.stock === StockFilter.OUT) {
      where.variants = { none: { stock: { gt: 0 } } };
    }

    return where;
  }

  private orderByFor(
    sort: ProductSort,
  ): Prisma.ProductOrderByWithRelationInput {
    switch (sort) {
      case ProductSort.OLDEST:
        return { createdAt: 'asc' };
      case ProductSort.TITLE_ASC:
        return { title: 'asc' };
      case ProductSort.TITLE_DESC:
        return { title: 'desc' };
      case ProductSort.TOP_RATED:
        return { ratingAverage: 'desc' };
      // Newest-first is the default, and the two unimplemented ranks degrade to
      // it: relevance needs a search score and best_selling needs order data
      // (script 11).
      case ProductSort.NEWEST:
      case ProductSort.RELEVANCE:
      case ProductSort.BEST_SELLING:
      default:
        return { createdAt: 'desc' };
    }
  }

  /** Store-wide low-stock threshold (StoreSetting singleton, default 5). */
  private async lowStockThreshold(): Promise<number> {
    const setting = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
      select: { lowStockThreshold: true },
    });
    return setting?.lowStockThreshold ?? 5;
  }

  /**
   * Price sorting via a `groupBy` over variants ordered by their min price —
   * correct and paginated without raw SQL. Returns hydrated list rows.
   */
  private async listByPrice(
    dto: ListProductsDto,
    isAdmin: boolean,
    skip: number,
    take: number,
    categoryIds?: string[],
    lowStockThreshold?: number,
  ): Promise<ListRow[]> {
    const direction: Prisma.SortOrder =
      dto.sort === ProductSort.PRICE_ASC ? 'asc' : 'desc';

    const productWhere = this.buildProductWhere(
      dto,
      isAdmin,
      categoryIds,
      lowStockThreshold,
    );
    const priceFilter: Prisma.IntFilter | undefined =
      dto.minPrice != null || dto.maxPrice != null
        ? { gte: dto.minPrice ?? undefined, lte: dto.maxPrice ?? undefined }
        : undefined;

    const grouped = await this.prisma.productVariant.groupBy({
      by: ['productId'],
      where: { product: productWhere, price: priceFilter },
      _min: { price: true },
      orderBy: { _min: { price: direction } },
      skip,
      take,
    });

    const ids = grouped.map((g) => g.productId);
    if (ids.length === 0) return [];

    const rows = await this.prisma.product.findMany({
      where: { id: { in: ids } },
      include: LIST_INCLUDE,
    });
    // Preserve the price-ordered id sequence from the groupBy.
    const byId = new Map(rows.map((r) => [r.id, r]));
    return ids.map((id) => byId.get(id)).filter((r): r is ListRow => !!r);
  }

  private toListItem(row: ListRow) {
    const now = new Date();
    // Effective (sale-aware) prices drive the card range; onSale flags the badge.
    const prices = row.variants.map((v) => effectivePriceCents(v, now));
    const onSale = row.variants.some((v) => isSaleActive(v, now));
    const primary = row.images[0];
    return {
      id: row.id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      onSale,
      // Denormalized aggregate rating (script 13); ×100 int → float for the card.
      rating: {
        average: row.ratingCount > 0 ? row.ratingAverage / 100 : null,
        count: row.ratingCount,
      },
      primaryImage: primary ? { url: primary.url, alt: primary.alt } : null,
      category: row.category,
      createdAt: row.createdAt,
    };
  }

  private decorateDetail(
    product: Prisma.ProductGetPayload<{ include: typeof DETAIL_INCLUDE }>,
  ) {
    const now = new Date();
    // Decorate each variant with its sale-aware effective price + compare-at so
    // the storefront can render a "Sale" badge and strike-through (FR-604).
    const variants = product.variants.map((v) => ({
      ...v,
      effectivePrice: effectivePriceCents(v, now),
      saleCompareAt: compareAtWhenOnSale(v, now),
      onSale: isSaleActive(v, now),
    }));
    const prices = variants.map((v) => v.effectivePrice);
    return {
      ...product,
      variants,
      tags: product.productTags.map((pt) => pt.tag),
      priceMin: prices.length ? Math.min(...prices) : null,
      priceMax: prices.length ? Math.max(...prices) : null,
      onSale: variants.some((v) => v.onSale),
      // Denormalized aggregate rating (script 13, FR-703); ×100 int → float.
      rating: {
        average: product.ratingCount > 0 ? product.ratingAverage / 100 : null,
        count: product.ratingCount,
      },
    };
  }

  private slugTaken(slug: string, exceptId?: string): Promise<boolean> {
    return this.prisma.product
      .findFirst({
        where: { slug, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
        select: { id: true },
      })
      .then((p) => !!p);
  }

  private async assertCategory(categoryId?: string): Promise<void> {
    if (!categoryId) return;
    const found = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('categoryId does not exist.');
  }

  private async assertTags(tagIds?: string[]): Promise<void> {
    if (!tagIds || tagIds.length === 0) return;
    const count = await this.prisma.tag.count({
      where: { id: { in: tagIds } },
    });
    if (count !== new Set(tagIds).size) {
      throw new BadRequestException('One or more tagIds do not exist.');
    }
  }

  private async assertProductExists(id: string): Promise<void> {
    const found = await this.prisma.product.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Product not found');
  }

  /** Build variant create rows with unique SKUs (auto-generated when omitted). */
  private async buildVariantCreateData(
    slug: string,
    variants: VariantInputDto[],
  ): Promise<Prisma.ProductVariantCreateWithoutProductInput[]> {
    const taken = new Set<string>();
    const rows: Prisma.ProductVariantCreateWithoutProductInput[] = [];
    for (const v of variants) {
      const optionSuffix = Object.values(v.options ?? {}).join('-');
      const sku = v.sku
        ? await this.buildSku(v.sku, taken)
        : await this.buildSku(`${slug}-${optionSuffix}`, taken);
      rows.push({
        sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice,
        stock: v.stock ?? 0,
        weightGrams: v.weightGrams,
        barcode: v.barcode,
        options: (v.options ?? {}) as Prisma.InputJsonValue,
      });
    }
    return rows;
  }

  /** Normalize to an uppercase SKU and suffix `-2`, `-3`… until globally unique. */
  private async buildSku(base: string, taken: Set<string>): Promise<string> {
    const root =
      base
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 48) || 'SKU';
    let candidate = root;
    let n = 2;
    while (
      candidate.length === 0 ||
      taken.has(candidate) ||
      (await this.skuExists(candidate))
    ) {
      candidate = `${root}-${n}`;
      n += 1;
    }
    taken.add(candidate);
    return candidate;
  }

  private skuExists(sku: string): Promise<boolean> {
    return this.prisma.productVariant
      .findUnique({ where: { sku }, select: { id: true } })
      .then((v) => !!v);
  }

  private async cleanupImages(publicIds: string[]): Promise<void> {
    const unique = [...new Set(publicIds)];
    await Promise.all(
      unique.map((pid) => this.media.cleanupCloudinaryAsset(pid)),
    );
  }
}
