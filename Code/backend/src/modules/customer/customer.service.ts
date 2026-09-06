import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

const PAID_STATUSES: OrderStatus[] = [
  OrderStatus.CONFIRMED,
  OrderStatus.PROCESSING,
  OrderStatus.SHIPPED,
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

/** Public (admin-facing) customer projection — never leaks password/tokens. */
function toListItem(u: {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  createdAt: Date;
  _count: { orders: number };
}) {
  return {
    id: u.id,
    firstName: u.firstName,
    lastName: u.lastName,
    email: u.email,
    status: u.status,
    createdAt: u.createdAt,
    orderCount: u._count.orders,
  };
}

/**
 * Admin customer management (script 15, FR-804). CUSTOMER-role users only — the
 * admin surface never lists or mutates other admins here. Every status change is
 * audited. RBAC is enforced by the controller's `@AdminOnly()`.
 */
@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(query: {
    search?: string;
    status?: UserStatus;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.UserWhereInput = { role: Role.CUSTOMER };
    if (query.status) where.status = query.status;
    if (query.search) {
      const q = query.search.trim();
      where.OR = [
        { firstName: { contains: q, mode: 'insensitive' } },
        { lastName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
      ];
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    // Lifetime spend per listed customer in one grouped query (paid orders only).
    const ids = rows.map((r) => r.id);
    const spend =
      ids.length > 0
        ? await this.prisma.order.groupBy({
            by: ['userId'],
            where: { userId: { in: ids }, status: { in: PAID_STATUSES } },
            _sum: { grandTotal: true },
          })
        : [];
    const spendByUser = new Map<number, number>(
      spend.map((s) => [s.userId as number, s._sum.grandTotal ?? 0]),
    );

    return {
      items: rows.map((r) => ({
        ...toListItem(r),
        totalSpentCents: spendByUser.get(r.id) ?? 0,
      })),
      page,
      pageSize,
      total,
    };
  }

  /** Full customer profile: addresses, recent orders, lifetime spend. */
  async getOne(id: number) {
    const user = await this.prisma.user.findFirst({
      where: { id, role: Role.CUSTOMER },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phoneNumber: true,
        status: true,
        provider: true,
        emailVerified: true,
        createdAt: true,
        addresses: true,
      },
    });
    if (!user) throw new NotFoundException('Customer not found');

    const [orders, spendAgg] = await Promise.all([
      this.prisma.order.findMany({
        where: { userId: id },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          grandTotal: true,
          currency: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.order.aggregate({
        where: { userId: id, status: { in: PAID_STATUSES } },
        _sum: { grandTotal: true },
        _count: true,
      }),
    ]);

    return {
      ...user,
      orders,
      lifetimeSpentCents: spendAgg._sum.grandTotal ?? 0,
      paidOrderCount: spendAgg._count,
    };
  }

  /**
   * Ban / reactivate a customer. Guarded so an admin can never flip another
   * admin's status through this surface. Banning also clears the refresh token so
   * existing sessions can't silently refresh (login is blocked in AuthService).
   */
  async setStatus(id: number, status: UserStatus, actorId?: number) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Customer not found');
    if (user.role !== Role.CUSTOMER) {
      throw new BadRequestException('Only customer accounts can be updated here');
    }

    const updated = await this.prisma.user.update({
      where: { id },
      data: {
        status,
        ...(status === UserStatus.BANNED ? { refreshToken: null } : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
      },
    });

    await this.audit.record({
      actorId: actorId ?? null,
      action: 'customer.status',
      entityType: 'User',
      entityId: String(id),
      metadata: { status },
    });

    return updated;
  }
}
