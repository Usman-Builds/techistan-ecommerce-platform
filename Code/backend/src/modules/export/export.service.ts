import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { OrderStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

const BATCH = 500;

/** RFC-4180 field escaping: quote when the value contains a comma/quote/newline. */
function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(fields: (string | number | null | undefined)[]): string {
  return fields.map(csvField).join(',') + '\r\n';
}

/** cents → plain decimal string (e.g. 1999 → "19.99"), for spreadsheet-friendly output. */
function money(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Streamed CSV exports (script 15, FR-809). Rows are written to the response in
 * batches via a keyset/offset cursor rather than buffering the whole result set
 * in memory, so a large catalog/order history downloads without a memory spike.
 * All `@AdminOnly()` at the controller. This backend surface did not exist before
 * — flagged as a required addition by the script.
 */
@Injectable()
export class ExportService {
  constructor(private readonly prisma: PrismaService) {}

  private begin(res: Response, filename: string) {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );
  }

  async streamOrders(
    res: Response,
    filter: {
      status?: OrderStatus;
      search?: string;
      from?: string;
      to?: string;
    },
  ): Promise<void> {
    this.begin(res, 'orders.csv');
    res.write(
      csvRow([
        'Order Number',
        'Date',
        'Customer Email',
        'Status',
        'Items',
        'Subtotal',
        'Discount',
        'Shipping',
        'Tax',
        'Total',
        'Currency',
      ]),
    );

    const where: Prisma.OrderWhereInput = {};
    if (filter.status) where.status = filter.status;
    if (filter.search) {
      const q = filter.search.trim();
      where.OR = [
        { orderNumber: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = new Date(filter.from);
      if (filter.to) where.createdAt.lte = new Date(filter.to);
    }

    let skip = 0;
    for (;;) {
      const rows = await this.prisma.order.findMany({
        where,
        select: {
          orderNumber: true,
          createdAt: true,
          email: true,
          status: true,
          subtotal: true,
          discountTotal: true,
          shippingTotal: true,
          taxTotal: true,
          grandTotal: true,
          currency: true,
          _count: { select: { items: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH,
      });
      if (rows.length === 0) break;
      for (const o of rows) {
        res.write(
          csvRow([
            o.orderNumber,
            o.createdAt.toISOString(),
            o.email,
            o.status,
            o._count.items,
            money(o.subtotal),
            money(o.discountTotal),
            money(o.shippingTotal),
            money(o.taxTotal),
            money(o.grandTotal),
            o.currency,
          ]),
        );
      }
      if (rows.length < BATCH) break;
      skip += BATCH;
    }
    res.end();
  }

  async streamCustomers(res: Response): Promise<void> {
    this.begin(res, 'customers.csv');
    res.write(
      csvRow([
        'ID',
        'First Name',
        'Last Name',
        'Email',
        'Status',
        'Orders',
        'Total Spent',
        'Joined',
      ]),
    );

    let skip = 0;
    for (;;) {
      const rows = await this.prisma.user.findMany({
        where: { role: Role.CUSTOMER },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          status: true,
          createdAt: true,
          _count: { select: { orders: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH,
      });
      if (rows.length === 0) break;

      const ids = rows.map((r) => r.id);
      const spend = await this.prisma.order.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: { in: PAID_STATUSES } },
        _sum: { grandTotal: true },
      });
      const spendByUser = new Map<number, number>(
        spend.map((s) => [s.userId as number, s._sum.grandTotal ?? 0]),
      );

      for (const u of rows) {
        res.write(
          csvRow([
            u.id,
            u.firstName,
            u.lastName,
            u.email,
            u.status,
            u._count.orders,
            money(spendByUser.get(u.id) ?? 0),
            u.createdAt.toISOString(),
          ]),
        );
      }
      if (rows.length < BATCH) break;
      skip += BATCH;
    }
    res.end();
  }

  async streamProducts(res: Response): Promise<void> {
    this.begin(res, 'products.csv');
    res.write(
      csvRow([
        'ID',
        'Title',
        'Slug',
        'Status',
        'Category',
        'Variants',
        'Total Stock',
        'Min Price',
        'Max Price',
        'Rating',
        'Reviews',
      ]),
    );

    let skip = 0;
    for (;;) {
      const rows = await this.prisma.product.findMany({
        select: {
          id: true,
          title: true,
          slug: true,
          status: true,
          ratingAverage: true,
          ratingCount: true,
          category: { select: { name: true } },
          variants: { select: { price: true, stock: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: BATCH,
      });
      if (rows.length === 0) break;
      for (const p of rows) {
        const prices = p.variants.map((v) => v.price);
        const totalStock = p.variants.reduce((sum, v) => sum + v.stock, 0);
        res.write(
          csvRow([
            p.id,
            p.title,
            p.slug,
            p.status,
            p.category?.name ?? '',
            p.variants.length,
            totalStock,
            prices.length ? money(Math.min(...prices)) : '',
            prices.length ? money(Math.max(...prices)) : '',
            p.ratingCount > 0 ? (p.ratingAverage / 100).toFixed(2) : '',
            p.ratingCount,
          ]),
        );
      }
      if (rows.length < BATCH) break;
      skip += BATCH;
    }
    res.end();
  }
}
