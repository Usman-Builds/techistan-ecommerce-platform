import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Order statuses that count as realized revenue (script 15). An order reaches
 * CONFIRMED only after payment succeeds (webhook), so these are the post-payment
 * states. REFUNDED is excluded (money returned); CANCELLED/PENDING never counted.
 */
const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

export interface RevenueBucket {
  revenueCents: number;
  orderCount: number;
}

export interface RevenueSummary {
  currency: string;
  today: RevenueBucket;
  week: RevenueBucket;
  month: RevenueBucket;
  year: RevenueBucket;
  aovCents: number; // average order value over the `month` window
}

export interface TimeSeriesPoint {
  date: string; // ISO day
  revenueCents: number;
  orderCount: number;
}

export interface OrderStats {
  totalOrders: number;
  byStatus: Record<string, number>;
  series: TimeSeriesPoint[];
}

export interface TopProduct {
  productId: string;
  title: string;
  slug: string;
  unitsSold: number;
  revenueCents: number;
}

export interface ConversionStats {
  currency: string;
  cartsCreated: number;
  paidOrders: number;
  totalOrders: number;
  conversionRate: number; // paidOrders / cartsCreated (0..1)
  aovCents: number;
}

/**
 * Admin analytics aggregates (script 15, FR-801). Endpoints the dashboard needs
 * were not previously exposed — this is the minimal backend addition flagged by
 * the script. Every query is a grouped/aggregate DB call; nothing is computed by
 * iterating rows in JS. All money is integer cents.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private async currency(): Promise<string> {
    const s = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
      select: { currency: true },
    });
    return s?.currency ?? 'USD';
  }

  /** Revenue + order count for a [from, to) window over paid orders. */
  private async bucket(from: Date, to: Date): Promise<RevenueBucket> {
    const agg = await this.prisma.order.aggregate({
      where: {
        status: { in: PAID_STATUSES },
        createdAt: { gte: from, lt: to },
      },
      _sum: { grandTotal: true },
      _count: true,
    });
    return {
      revenueCents: agg._sum.grandTotal ?? 0,
      orderCount: agg._count,
    };
  }

  /** KPI cards: revenue today / this week / this month / this year + AOV. */
  async revenueSummary(): Promise<RevenueSummary> {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - 6); // trailing 7 days incl. today

    const startOfMonth = new Date(startOfToday);
    startOfMonth.setDate(startOfMonth.getDate() - 29); // trailing 30 days

    const startOfYear = new Date(now.getFullYear(), 0, 1);
    const end = new Date(now.getTime() + 1000); // include the current instant

    const [today, week, month, year, currency] = await Promise.all([
      this.bucket(startOfToday, end),
      this.bucket(startOfWeek, end),
      this.bucket(startOfMonth, end),
      this.bucket(startOfYear, end),
      this.currency(),
    ]);

    const aovCents =
      month.orderCount > 0
        ? Math.round(month.revenueCents / month.orderCount)
        : 0;

    return { currency, today, week, month, year, aovCents };
  }

  private range(from?: string, to?: string): { from: Date; to: Date } {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from
      ? new Date(from)
      : new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Normalize an inclusive upper bound to end-of-day when only a date is given.
    return { from: fromDate, to: toDate };
  }

  /** Order counts by status + a daily revenue/order time series for the range. */
  async orderStats(from?: string, to?: string): Promise<OrderStats> {
    const { from: gte, to: lte } = this.range(from, to);

    const grouped = await this.prisma.order.groupBy({
      by: ['status'],
      where: { createdAt: { gte, lte } },
      _count: true,
    });

    const byStatus: Record<string, number> = {};
    let totalOrders = 0;
    for (const row of grouped) {
      byStatus[row.status] = row._count;
      totalOrders += row._count;
    }

    const rows = await this.prisma.$queryRaw<
      { day: Date; orders: bigint; revenue: bigint }[]
    >(Prisma.sql`
      SELECT date_trunc('day', "createdAt") AS day,
             COUNT(*)::bigint AS orders,
             COALESCE(SUM("grandTotal"), 0)::bigint AS revenue
      FROM "Order"
      WHERE "createdAt" >= ${gte} AND "createdAt" <= ${lte}
        AND "status"::text IN (${Prisma.join(PAID_STATUSES)})
      GROUP BY day
      ORDER BY day ASC
    `);

    const series: TimeSeriesPoint[] = rows.map((r) => ({
      date: r.day.toISOString(),
      revenueCents: Number(r.revenue),
      orderCount: Number(r.orders),
    }));

    return { totalOrders, byStatus, series };
  }

  /** Best-selling products by units sold within the range (paid orders only). */
  async topProducts(
    from?: string,
    to?: string,
    limit = 10,
  ): Promise<TopProduct[]> {
    const { from: gte, to: lte } = this.range(from, to);

    const rows = await this.prisma.$queryRaw<
      {
        productId: string;
        title: string;
        slug: string;
        units: bigint;
        revenue: bigint;
      }[]
    >(Prisma.sql`
      SELECT p."id"    AS "productId",
             p."title" AS "title",
             p."slug"  AS "slug",
             SUM(oi."quantity")::bigint AS units,
             SUM(oi."total")::bigint    AS revenue
      FROM "OrderItem" oi
      JOIN "Order" o ON o."id" = oi."orderId"
      JOIN "ProductVariant" v ON v."id" = oi."variantId"
      JOIN "Product" p ON p."id" = v."productId"
      WHERE o."createdAt" >= ${gte} AND o."createdAt" <= ${lte}
        AND o."status"::text IN (${Prisma.join(PAID_STATUSES)})
      GROUP BY p."id", p."title", p."slug"
      ORDER BY units DESC
      LIMIT ${limit}
    `);

    return rows.map((r) => ({
      productId: r.productId,
      title: r.title,
      slug: r.slug,
      unitsSold: Number(r.units),
      revenueCents: Number(r.revenue),
    }));
  }

  /**
   * Conversion proxy (script 15). We don't track anonymous page-view sessions, so
   * conversion is approximated as paid-orders ÷ carts-created in the window — the
   * closest first-party signal available. AOV is revenue ÷ paid orders.
   */
  async conversion(from?: string, to?: string): Promise<ConversionStats> {
    const { from: gte, to: lte } = this.range(from, to);

    const [cartsCreated, paidAgg, totalOrders, currency] = await Promise.all([
      this.prisma.cart.count({ where: { createdAt: { gte, lte } } }),
      this.prisma.order.aggregate({
        where: { status: { in: PAID_STATUSES }, createdAt: { gte, lte } },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.order.count({ where: { createdAt: { gte, lte } } }),
      this.currency(),
    ]);

    const paidOrders = paidAgg._count;
    const revenue = paidAgg._sum.grandTotal ?? 0;

    return {
      currency,
      cartsCreated,
      paidOrders,
      totalOrders,
      conversionRate: cartsCreated > 0 ? paidOrders / cartsCreated : 0,
      aovCents: paidOrders > 0 ? Math.round(revenue / paidOrders) : 0,
    };
  }
}
