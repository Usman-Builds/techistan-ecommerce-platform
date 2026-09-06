import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateNotificationInput {
  userId: number;
  type: string;
  title: string;
  body?: string | null;
  data?: Prisma.InputJsonValue | null;
}

/** Admin-fanout input (no userId — it is created for every admin user). */
export type CreateAdminNotificationInput = Omit<CreateNotificationInput, 'userId'>;

/**
 * In-app notification store (script 16, FR-902..904). Rows are owned by a user;
 * every read/write is scoped to the caller's id server-side (NFR-208) so a
 * customer can never see another account's — or an admin's — notifications. Admin
 * alerts are simply Notification rows fanned out to every admin user, so both
 * clients consume the identical REST surface.
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Insert one notification. Best-effort — never throws into the caller. */
  async create(input: CreateNotificationInput): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          data:
            input.data === null || input.data === undefined
              ? Prisma.JsonNull
              : input.data,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to create notification for user ${input.userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Fan a notification out to every ADMIN / SUPER_ADMIN user. */
  async createForAdmins(input: CreateAdminNotificationInput): Promise<void> {
    try {
      const admins = await this.prisma.user.findMany({
        where: { role: { in: [Role.ADMIN, Role.SUPER_ADMIN] } },
        select: { id: true },
      });
      if (admins.length === 0) return;
      await this.prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: input.type,
          title: input.title,
          body: input.body ?? null,
          data:
            input.data === null || input.data === undefined
              ? Prisma.JsonNull
              : (input.data as Prisma.InputJsonValue),
        })),
      });
    } catch (err) {
      this.logger.error(
        `Failed to fan out admin notification: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /** Paginated list for the caller (newest first) + the current unread count. */
  async list(
    userId: number,
    query: { page?: number; pageSize?: number; unreadOnly?: boolean },
  ) {
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));

    const where: Prisma.NotificationWhereInput = { userId };
    if (query.unreadOnly) where.readAt = null;

    const [items, total, unreadCount] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items, page, pageSize, total, unreadCount };
  }

  /** Unread count for the caller. */
  async unreadCount(userId: number): Promise<{ count: number }> {
    const count = await this.prisma.notification.count({
      where: { userId, readAt: null },
    });
    return { count };
  }

  /** Mark one of the caller's notifications read (scoped by userId). */
  async markRead(userId: number, id: string): Promise<{ success: true }> {
    // Scope the update to the owner so a guessed id from another user is a 404.
    const result = await this.prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (result.count === 0) {
      // Either it does not exist, is not the caller's, or was already read.
      const exists = await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Notification not found');
    }
    return { success: true };
  }

  /** Mark ALL of the caller's notifications read. */
  async markAllRead(userId: number): Promise<{ updated: number }> {
    const result = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }
}
