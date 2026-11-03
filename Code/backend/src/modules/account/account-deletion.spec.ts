import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AccountService } from './account.service';

/**
 * GDPR account deletion (FR-114, #47): the 30-day grace window is scheduled
 * idempotently, only an ACTIVE account can enter it (so a ban can't be undone
 * by schedule-then-cancel), cancel works only from PENDING_DELETION, and the
 * daily job anonymizes exactly the accounts whose window has elapsed.
 */
const DAY_MS = 24 * 60 * 60 * 1000;

function setup(user: { status: string; deletionScheduledAt?: Date | null }) {
  const prisma = {
    user: {
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          status: user.status,
          deletionScheduledAt: user.deletionScheduledAt ?? null,
        }),
      ),
      update: jest.fn(() => Promise.resolve({})),
      findMany: jest.fn(() => Promise.resolve([] as { id: number }[])),
    },
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const service = new AccountService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('AccountService deletion (#47)', () => {
  describe('requestDeletion', () => {
    it('schedules an ACTIVE account 30 days out and audits it', async () => {
      const { service, prisma, audit } = setup({ status: 'ACTIVE' });
      const before = Date.now();

      const res = await service.requestDeletion(7);

      expect(res.alreadyScheduled).toBe(false);
      const when = res.deletionScheduledAt.getTime();
      expect(when).toBeGreaterThanOrEqual(before + 30 * DAY_MS);
      expect(when).toBeLessThanOrEqual(Date.now() + 30 * DAY_MS);
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: {
          status: 'PENDING_DELETION',
          deletionScheduledAt: res.deletionScheduledAt,
        },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.deletion_requested' }),
      );
    });

    it('is idempotent: a repeat request keeps the original date', async () => {
      const scheduled = new Date(Date.now() + 10 * DAY_MS);
      const { service, prisma } = setup({
        status: 'PENDING_DELETION',
        deletionScheduledAt: scheduled,
      });

      const res = await service.requestDeletion(7);

      expect(res).toEqual({
        deletionScheduledAt: scheduled,
        alreadyScheduled: true,
      });
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('refuses a BANNED account (no schedule-then-cancel unban)', async () => {
      const { service, prisma } = setup({ status: 'BANNED' });
      await expect(service.requestDeletion(7)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('cancelDeletion', () => {
    it('restores a pending account to ACTIVE and clears the date', async () => {
      const { service, prisma, audit } = setup({
        status: 'PENDING_DELETION',
        deletionScheduledAt: new Date(),
      });

      await expect(service.cancelDeletion(7)).resolves.toEqual({
        cancelled: true,
      });
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 7 },
        data: { status: 'ACTIVE', deletionScheduledAt: null },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'account.deletion_cancelled' }),
      );
    });

    it.each(['ACTIVE', 'BANNED', 'DELETED'])(
      'refuses when the account is %s',
      async (status) => {
        const { service, prisma } = setup({ status });
        await expect(service.cancelDeletion(7)).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(prisma.user.update).not.toHaveBeenCalled();
      },
    );
  });

  describe('anonymizeExpired', () => {
    it('selects only pending accounts whose window has elapsed', async () => {
      const { service, prisma } = setup({ status: 'ACTIVE' });
      const now = new Date('2026-11-03T00:00:00Z');

      await expect(service.anonymizeExpired(now)).resolves.toBe(0);

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        where: {
          status: 'PENDING_DELETION',
          deletionScheduledAt: { lte: now },
        },
        select: { id: true },
      });
    });

    it('keeps going when one account fails and counts the rest', async () => {
      const { service, prisma } = setup({ status: 'ACTIVE' });
      prisma.user.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }]);
      const anonymize = jest
        .spyOn(
          service as unknown as {
            anonymizeUser(id: number): Promise<void>;
          },
          'anonymizeUser',
        )
        .mockImplementation((id: number) =>
          id === 2 ? Promise.reject(new Error('db down')) : Promise.resolve(),
        );

      await expect(service.anonymizeExpired()).resolves.toBe(2);
      expect(anonymize).toHaveBeenCalledTimes(3);
    });
  });
});
