import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface AuditRecord {
  /** JWT user id of the admin performing the mutation; null if unattributable. */
  actorId?: number | null;
  /** Dotted verb, e.g. "product.create", "category.reorder", "product.bulk". */
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Central audit log (FR-808). Every admin mutation in the catalog domain (and
 * later order/promotion/settings domains) calls `record()`. Reads are never
 * audited.
 *
 * Writes are best-effort: an audit failure is logged but never propagated, so a
 * transient logging problem can't roll back or block the business operation.
 * Pass a transaction client (`tx`) to co-commit the audit row with the mutation.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    entry: AuditRecord,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    try {
      await client.auditLog.create({
        data: {
          actorId: entry.actorId ?? null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          metadata: entry.metadata ?? Prisma.JsonNull,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit log "${entry.action}" for ${entry.entityType}:${entry.entityId} — ${String(err)}`,
      );
    }
  }

  /** Convenience for writing many entries (e.g. bulk actions), best-effort each. */
  async recordMany(entries: AuditRecord[]): Promise<void> {
    await Promise.all(entries.map((e) => this.record(e)));
  }

  /**
   * Read the audit trail (script 15, FR-808). Filterable by actor, action
   * (contains), entity type, and date range; newest first, paginated. Read-only —
   * the viewer is admin-guarded at the controller. The actor is joined so the UI
   * can show "who" without a second lookup.
   */
  async query(filter: {
    actorId?: number;
    action?: string;
    entityType?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }) {
    const page = Math.max(1, filter.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 25));

    const where: Prisma.AuditLogWhereInput = {};
    if (filter.actorId !== undefined) where.actorId = filter.actorId;
    if (filter.action) where.action = { contains: filter.action, mode: 'insensitive' };
    if (filter.entityType)
      where.entityType = { contains: filter.entityType, mode: 'insensitive' };
    if (filter.from || filter.to) {
      where.createdAt = {};
      if (filter.from) where.createdAt.gte = new Date(filter.from);
      if (filter.to) where.createdAt.lte = new Date(filter.to);
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { items: rows, page, pageSize, total };
  }
}
