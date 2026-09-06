import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CategoryService } from '../category/category.service';
import { NotifierService } from '../notification/notifier.service';
import {
  InventoryQueryDto,
  InventorySort,
  InventoryStockFilter,
} from './dto/inventory-query.dto';

const DEFAULT_LOW_STOCK_THRESHOLD = 5;

interface VariantRow {
  id: string;
  sku: string;
  stock: number;
  price: number;
  options: Prisma.JsonValue;
  product: { id: string; title: string; slug: string; status: string };
}

function toInventoryItem(v: VariantRow, threshold: number) {
  return {
    variantId: v.id,
    sku: v.sku,
    stock: v.stock,
    priceCents: v.price,
    options: v.options,
    productId: v.product.id,
    productTitle: v.product.title,
    productSlug: v.product.slug,
    productStatus: v.product.status,
    lowStock: v.stock <= threshold,
  };
}

const VARIANT_SELECT = {
  id: true,
  sku: true,
  stock: true,
  price: true,
  options: true,
  product: { select: { id: true, title: true, slug: true, status: true } },
} satisfies Prisma.ProductVariantSelect;

/**
 * Admin inventory (script 15, FR-805). Stock lives on ProductVariant; this is the
 * admin read/adjust surface (there was none before). The "low" threshold is read
 * from the StoreSetting singleton (lowStockThreshold, default 5).
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly categories: CategoryService,
    private readonly notifier: NotifierService,
  ) {}

  async threshold(): Promise<number> {
    const s = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
      select: { lowStockThreshold: true },
    });
    return s?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  }

  /**
   * Filtered, sorted, paginated variant list plus store-wide totals.
   *
   * The totals are computed over the FILTERED set, not the whole catalog, so
   * "Laptops, low stock" answers "how many units and how much capital is
   * sitting in that bucket" — which is the question that makes the filter worth
   * applying. They come from one `aggregate` alongside the page query rather
   * than by summing the current page, which would only ever describe 30 rows.
   */
  async list(query: InventoryQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, query.pageSize ?? 30));
    const threshold = await this.threshold();
    const where = await this.buildWhere(query, threshold);

    const [rows, total, totals] = await this.prisma.$transaction([
      this.prisma.productVariant.findMany({
        where,
        select: VARIANT_SELECT,
        orderBy: this.orderByFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.productVariant.count({ where }),
      this.prisma.productVariant.aggregate({
        where,
        _sum: { stock: true },
        _count: { _all: true },
      }),
    ]);

    // Retail value has to be summed in JS: it is stock × price per row, and
    // Prisma's aggregate cannot multiply two columns.
    const valued = await this.prisma.productVariant.findMany({
      where,
      select: { stock: true, price: true, salePrice: true },
    });
    const retailValueCents = valued.reduce(
      (sum, v) => sum + v.stock * (v.salePrice ?? v.price),
      0,
    );
    const outOfStock = valued.filter((v) => v.stock === 0).length;
    const lowStock = valued.filter(
      (v) => v.stock > 0 && v.stock <= threshold,
    ).length;

    return {
      items: rows.map((r) => toInventoryItem(r, threshold)),
      page,
      pageSize,
      total,
      threshold,
      totals: {
        variants: totals._count._all,
        units: totals._sum.stock ?? 0,
        retailValueCents,
        outOfStock,
        lowStock,
      },
    };
  }

  /** Translate the query DTO into a Prisma predicate. */
  private async buildWhere(
    query: InventoryQueryDto,
    threshold: number,
  ): Promise<Prisma.ProductVariantWhereInput> {
    const where: Prisma.ProductVariantWhereInput = {};
    const product: Prisma.ProductWhereInput = {};

    // `lowStockOnly` is the legacy toggle; `stock` supersedes it.
    const band =
      query.stock ??
      (query.lowStockOnly ? InventoryStockFilter.LOW : undefined);
    if (band === InventoryStockFilter.OUT) where.stock = { lte: 0 };
    else if (band === InventoryStockFilter.LOW) {
      where.stock = { gt: 0, lte: threshold };
    } else if (band === InventoryStockFilter.IN)
      where.stock = { gt: threshold };

    // Explicit bounds refine the band rather than replacing it, so
    // "low stock, at least 2 left" is expressible.
    if (query.minStock != null || query.maxStock != null) {
      where.stock = {
        ...(typeof where.stock === 'object' ? where.stock : {}),
        ...(query.minStock != null ? { gte: query.minStock } : {}),
        ...(query.maxStock != null ? { lte: query.maxStock } : {}),
      };
    }

    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { product: { title: { contains: q, mode: 'insensitive' } } },
      ];
    }

    if (query.categoryId) {
      // Empty array = the id matched nothing, which must yield no rows.
      const ids = await this.categories.descendantIds([query.categoryId]);
      product.categoryId = { in: ids };
    }
    if (query.brandId) product.brandId = query.brandId;
    if (query.productStatus) product.status = query.productStatus;
    if (Object.keys(product).length > 0) where.product = product;

    return where;
  }

  private orderByFor(
    sort?: InventorySort,
  ): Prisma.ProductVariantOrderByWithRelationInput[] {
    switch (sort) {
      case InventorySort.STOCK_DESC:
        return [{ stock: 'desc' }, { sku: 'asc' }];
      case InventorySort.SKU_ASC:
        return [{ sku: 'asc' }];
      case InventorySort.TITLE_ASC:
        return [{ product: { title: 'asc' } }, { sku: 'asc' }];
      case InventorySort.PRICE_ASC:
        return [{ price: 'asc' }, { sku: 'asc' }];
      case InventorySort.PRICE_DESC:
        return [{ price: 'desc' }, { sku: 'asc' }];
      // "Value" would be stock × price, which Prisma cannot order by, so this
      // approximates it with stock desc — the factor that actually varies by
      // orders of magnitude across a catalog.
      case InventorySort.VALUE_DESC:
        return [{ stock: 'desc' }, { price: 'desc' }];
      case InventorySort.STOCK_ASC:
      default:
        return [{ stock: 'asc' }, { sku: 'asc' }];
    }
  }

  /** Variants at or below the configured low-stock threshold (dashboard alert). */
  async lowStock(limit = 50) {
    const threshold = await this.threshold();
    const rows = await this.prisma.productVariant.findMany({
      where: { stock: { lte: threshold } },
      select: VARIANT_SELECT,
      orderBy: { stock: 'asc' },
      take: limit,
    });
    return {
      items: rows.map((r) => toInventoryItem(r, threshold)),
      threshold,
    };
  }

  /** Set a variant's absolute on-hand stock. Audited. */
  async adjust(variantId: string, stock: number, actorId?: number) {
    const existing = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      select: { id: true, stock: true },
    });
    if (!existing) throw new NotFoundException('Variant not found');

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { stock },
      select: VARIANT_SELECT,
    });

    await this.audit.record({
      actorId: actorId ?? null,
      action: 'inventory.adjust',
      entityType: 'ProductVariant',
      entityId: variantId,
      metadata: { from: existing.stock, to: stock },
    });

    const threshold = await this.threshold();

    // Admin low-stock alert (FR-902) — fire only on a downward crossing, so the
    // bell isn't re-pinged for every adjustment while a variant stays low.
    if (stock <= threshold && existing.stock > threshold) {
      void this.notifier.lowStock({
        variantId: updated.id,
        productId: updated.product.id,
        productTitle: updated.product.title,
        sku: updated.sku,
        stock: updated.stock,
        threshold,
      });
    }

    return toInventoryItem(updated, threshold);
  }
}
