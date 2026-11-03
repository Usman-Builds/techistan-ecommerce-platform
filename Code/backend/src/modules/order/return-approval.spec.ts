import { BadRequestException } from '@nestjs/common';
import { ReturnStatus } from '@prisma/client';
import { OrderService } from './order.service';

/**
 * Approving a return restocks and refunds (FR-508). Two concurrent approvals
 * (double-click, two admins) must do that exactly once (#8). The Prisma stub
 * keeps the return row in memory and yields between reads and writes, so the
 * two calls interleave the way two requests would.
 */
const tick = () => new Promise((r) => setImmediate(r));

function setup(refundImpl?: () => Promise<{ amountCents: number }>) {
  const ret = {
    id: 'r1',
    orderId: 'o1',
    reasonCode: 'DAMAGED',
    status: ReturnStatus.REQUESTED as ReturnStatus,
    note: null as string | null,
    items: [
      {
        orderItemId: 'oi1',
        variantId: 'v1',
        sku: 'SKU-1',
        productTitle: 'Thing',
        quantity: 2,
        unitPrice: 1500,
      },
    ],
    refundAmount: null as number | null,
    createdAt: new Date(),
  };
  const stock = { v1: 10 };

  const returnRequest = {
    findUnique: jest.fn(async () => {
      const snap = { ...ret };
      await tick();
      return snap;
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; status?: ReturnStatus };
        data: Partial<typeof ret>;
      }) => {
        await tick();
        if (where.status && ret.status !== where.status) return { count: 0 };
        Object.assign(ret, data);
        return { count: 1 };
      },
    ),
    update: jest.fn(async ({ data }: { data: Partial<typeof ret> }) => {
      await tick();
      Object.assign(ret, data);
      return { ...ret };
    }),
  };
  const productVariant = {
    update: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: 'v1' };
        data: { stock: { increment?: number; decrement?: number } };
      }) => {
        await tick();
        stock[where.id] +=
          (data.stock.increment ?? 0) - (data.stock.decrement ?? 0);
        return {};
      },
    ),
  };
  const tx = { returnRequest, productVariant };
  const prisma = {
    returnRequest,
    productVariant,
    order: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'o1' }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const payment = {
    processRefund: jest.fn(
      refundImpl ?? (() => Promise.resolve({ amountCents: 3000 })),
    ),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifier = { returnUpdated: jest.fn().mockResolvedValue(undefined) };
  const service = new OrderService(
    prisma as never,
    {} as never,
    payment as never,
    {} as never,
    audit as never,
    notifier as never,
  );
  return { service, ret, stock, payment };
}

const actor = { userId: 1, role: 'ADMIN' } as never;

describe('OrderService.approveReturn concurrency (#8)', () => {
  it('approves once: restocks and refunds a single time', async () => {
    const { service, ret, stock, payment } = setup();

    const results = await Promise.allSettled([
      service.approveReturn('o1', 'r1', undefined, actor),
      service.approveReturn('o1', 'r1', undefined, actor),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rejected = results.find((r) => r.status === 'rejected');
    expect(rejected?.reason).toBeInstanceOf(BadRequestException);
    expect(payment.processRefund).toHaveBeenCalledTimes(1);
    expect(stock.v1).toBe(12);
    expect(ret.status).toBe(ReturnStatus.APPROVED);
    expect(ret.refundAmount).toBe(3000);
  });

  it('rejects a second approval after the first completes', async () => {
    const { service, stock, payment } = setup();
    await service.approveReturn('o1', 'r1', undefined, actor);
    await expect(
      service.approveReturn('o1', 'r1', undefined, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(payment.processRefund).toHaveBeenCalledTimes(1);
    expect(stock.v1).toBe(12);
  });

  it('undoes the claim and restock when the refund fails unexpectedly', async () => {
    const { service, ret, stock } = setup(() =>
      Promise.reject(new Error('stripe exploded')),
    );
    await expect(
      service.approveReturn('o1', 'r1', undefined, actor),
    ).rejects.toThrow('stripe exploded');
    expect(ret.status).toBe(ReturnStatus.REQUESTED);
    expect(stock.v1).toBe(10);
  });
});
