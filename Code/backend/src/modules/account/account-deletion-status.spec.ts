import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserStatus } from '@prisma/client';
import { AccountService } from './account.service';

/**
 * Self-service deletion must never become a way to change moderation status
 * (#24): a BANNED (or already DELETED) account can't schedule deletion, so it
 * can't later "cancel" its way back to ACTIVE.
 */
function setup(status: UserStatus, deletionScheduledAt: Date | null = null) {
  const prisma = {
    user: {
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ status, deletionScheduledAt }),
      update: jest.fn().mockResolvedValue({}),
    },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AccountService(prisma as never, audit as never);
  return { service, prisma, audit };
}

describe('AccountService deletion status transitions (#24)', () => {
  it('schedules deletion for an ACTIVE account', async () => {
    const { service, prisma } = setup(UserStatus.ACTIVE);
    const res = await service.requestDeletion(1);
    expect(res.alreadyScheduled).toBe(false);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PENDING_DELETION' }),
      }),
    );
  });

  it('returns the existing schedule when already pending', async () => {
    const when = new Date('2030-01-01');
    const { service, prisma } = setup(UserStatus.PENDING_DELETION, when);
    await expect(service.requestDeletion(1)).resolves.toEqual({
      deletionScheduledAt: when,
      alreadyScheduled: true,
    });
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([UserStatus.BANNED, UserStatus.DELETED])(
    'refuses to schedule deletion for a %s account',
    async (status) => {
      const { service, prisma, audit } = setup(status);
      await expect(service.requestDeletion(1)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.user.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('a BANNED account cannot reach ACTIVE via request + cancel', async () => {
    const { service, prisma } = setup(UserStatus.BANNED);
    await expect(service.requestDeletion(1)).rejects.toThrow();
    await expect(service.cancelDeletion(1)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});
