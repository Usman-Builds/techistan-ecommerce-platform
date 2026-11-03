import { ConflictException } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { PaymentService } from './payment.service';

/**
 * Refunds (#4): two concurrent refunds must never both reach Stripe on the same
 * refundable balance, and `refundedAmount` must always equal what Stripe
 * actually refunded. The Prisma stub keeps the payment row in memory and yields
 * between awaits so concurrent calls interleave like real requests.
 */
const tick = () => new Promise((r) => setImmediate(r));

function setup(refundsCreate?: jest.Mock) {
  const pay = {
    id: 'pay_1',
    orderId: 'ord_1',
    amount: 1000,
    refundedAmount: 0,
    status: PaymentStatus.SUCCEEDED as PaymentStatus,
    stripePaymentIntentId: 'pi_1',
  };
  const order = {
    id: 'ord_1',
    orderNumber: 'ORD-1',
    email: 'shopper@example.com',
    userId: 1,
    status: 'CONFIRMED',
  };
  let stripeRefunded = 0;
  const create =
    refundsCreate ??
    jest.fn(async (params: { amount: number }) => {
      await tick();
      stripeRefunded += params.amount;
      return { id: `re_${stripeRefunded}` };
    });
  const stripe = { refunds: { create } };

  type Where = { id: string; refundedAmount?: number };
  type Data = {
    refundedAmount?: number | { increment?: number; decrement?: number };
    status?: PaymentStatus;
  };
  const apply = (data: Data) => {
    const r = data.refundedAmount;
    if (typeof r === 'number') pay.refundedAmount = r;
    else if (r) pay.refundedAmount += (r.increment ?? 0) - (r.decrement ?? 0);
    if (data.status) pay.status = data.status;
  };
  const payment = {
    update: jest.fn(async ({ data }: { data: Data }) => {
      await tick();
      apply(data);
      return { ...pay };
    }),
    updateMany: jest.fn(
      async ({ where, data }: { where: Where; data: Data }) => {
        await tick();
        if (
          where.refundedAmount !== undefined &&
          where.refundedAmount !== pay.refundedAmount
        ) {
          return { count: 0 };
        }
        apply(data);
        return { count: 1 };
      },
    ),
  };
  const tx = { payment, order: { update: jest.fn() } };
  const prisma = {
    payment,
    order: {
      findUnique: jest.fn(async () => {
        const snap = { ...order, payments: [{ ...pay }] };
        await tick();
        return snap;
      }),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new PaymentService(
    stripe as unknown as Stripe,
    prisma as never,
    { get: jest.fn().mockReturnValue('whsec_test') } as never,
    {} as never,
    { record: jest.fn().mockResolvedValue(undefined) } as never,
    { refundProcessed: jest.fn().mockResolvedValue(undefined) } as never,
  );
  return { service, pay, create, stripeRefunded: () => stripeRefunded };
}

describe('PaymentService.processRefund concurrency (#4)', () => {
  it('lets only one of two concurrent full refunds reach Stripe', async () => {
    const { service, pay, create, stripeRefunded } = setup();

    const results = await Promise.allSettled([
      service.processRefund('ord_1', undefined, 1),
      service.processRefund('ord_1', undefined, 1),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(create).toHaveBeenCalledTimes(1);
    expect(stripeRefunded()).toBe(1000);
    expect(pay.refundedAmount).toBe(1000);
    expect(pay.status).toBe(PaymentStatus.REFUNDED);
  });

  it('records both of two concurrent partial refunds that fit, never losing one', async () => {
    const { service, pay, stripeRefunded } = setup();

    const results = await Promise.allSettled([
      service.processRefund('ord_1', 300, 1),
      service.processRefund('ord_1', 300, 1),
    ]);

    // Whatever reached Stripe is exactly what the DB records.
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    expect(stripeRefunded()).toBe(ok * 300);
    expect(pay.refundedAmount).toBe(stripeRefunded());
    for (const r of results) {
      if (r.status === 'rejected')
        expect(r.reason).toBeInstanceOf(ConflictException);
    }
  });

  it('passes a deterministic idempotency key to Stripe', async () => {
    const { service, create } = setup();
    await service.processRefund('ord_1', 400, 1);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 400 }),
      { idempotencyKey: 'refund:pay_1:0:400' },
    );
  });

  it('releases the reservation when Stripe rejects the refund', async () => {
    const failing = jest.fn().mockRejectedValue(new Error('card_declined'));
    const { service, pay } = setup(failing);

    await expect(service.processRefund('ord_1', 400, 1)).rejects.toThrow(
      'card_declined',
    );
    expect(pay.refundedAmount).toBe(0);
    expect(pay.status).toBe(PaymentStatus.SUCCEEDED);
  });
});
