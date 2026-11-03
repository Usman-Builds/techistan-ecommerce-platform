import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { PaymentService } from './payment.service';

/**
 * PaymentService.processRefund (FR-413, #5): full and partial refunds, every
 * rejection branch, and that a Stripe failure leaves the books untouched.
 * Concurrency (#4) is covered separately in refund-concurrency.spec.ts.
 */
type PaymentRow = {
  id: string;
  amount: number;
  refundedAmount: number;
  status: PaymentStatus;
  stripePaymentIntentId: string | null;
};

function setup(
  opts: {
    payments?: PaymentRow[];
    orderMissing?: boolean;
    noStripe?: boolean;
    stripeError?: Error;
  } = {},
) {
  const payments = opts.payments ?? [
    {
      id: 'pay_1',
      amount: 5000,
      refundedAmount: 0,
      status: PaymentStatus.SUCCEEDED,
      stripePaymentIntentId: 'pi_1',
    },
  ];
  const order = {
    id: 'ord_1',
    orderNumber: 'ORD-1',
    email: 'shopper@example.com',
    userId: 3,
    currency: 'USD',
    status: OrderStatus.DELIVERED,
    payments,
  };
  const stripe = {
    refunds: {
      create: jest.fn(() =>
        opts.stripeError
          ? Promise.reject(opts.stripeError)
          : Promise.resolve({ id: 're_1' }),
      ),
    },
  };
  const tx = {
    payment: { update: jest.fn() },
    order: { update: jest.fn() },
  };
  const prisma = {
    order: {
      findUnique: jest.fn(() =>
        Promise.resolve(opts.orderMissing ? null : order),
      ),
    },
    payment: { updateMany: jest.fn(() => Promise.resolve({ count: 1 })) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const notifier = { refundProcessed: jest.fn(() => Promise.resolve()) };
  const service = new PaymentService(
    (opts.noStripe ? null : stripe) as unknown as Stripe,
    prisma as never,
    { get: jest.fn().mockReturnValue('whsec_test') } as never,
    {} as never,
    audit as never,
    notifier as never,
  );
  return { service, stripe, tx, prisma, audit, notifier };
}

describe('PaymentService.processRefund (#5)', () => {
  describe('success', () => {
    it('refunds the whole remaining balance when no amount is given', async () => {
      const { service, stripe, tx, prisma } = setup();

      const result = await service.processRefund('ord_1', undefined, 9);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_1', amount: 5000 },
        { idempotencyKey: 'refund:pay_1:0:5000' },
      );
      // The amount is reserved against the balance it was validated on.
      expect(prisma.payment.updateMany).toHaveBeenCalledWith({
        where: { id: 'pay_1', refundedAmount: 0 },
        data: { refundedAmount: { increment: 5000 } },
      });
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_1' },
        data: { status: PaymentStatus.REFUNDED },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: { status: OrderStatus.REFUNDED },
      });
      expect(result).toEqual({
        orderId: 'ord_1',
        refundId: 're_1',
        amountCents: 5000,
        refundedTotal: 5000,
        fullyRefunded: true,
      });
    });

    it('records a partial refund without changing the order status', async () => {
      const { service, tx } = setup();

      const result = await service.processRefund('ord_1', 2000, 9);

      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_1' },
        data: { status: PaymentStatus.PARTIALLY_REFUNDED },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: {},
      });
      expect(result).toMatchObject({
        amountCents: 2000,
        refundedTotal: 2000,
        fullyRefunded: false,
      });
    });

    it('completes a partially refunded payment with the exact remainder', async () => {
      const { service, stripe, tx } = setup({
        payments: [
          {
            id: 'pay_1',
            amount: 5000,
            refundedAmount: 2000,
            status: PaymentStatus.PARTIALLY_REFUNDED,
            stripePaymentIntentId: 'pi_1',
          },
        ],
      });

      const result = await service.processRefund('ord_1', 3000, 9);

      expect(stripe.refunds.create).toHaveBeenCalledWith(
        { payment_intent: 'pi_1', amount: 3000 },
        { idempotencyKey: 'refund:pay_1:2000:3000' },
      );
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: { status: OrderStatus.REFUNDED },
      });
      expect(result).toMatchObject({
        refundedTotal: 5000,
        fullyRefunded: true,
      });
    });

    it('writes an audit entry and notifies the customer', async () => {
      const { service, audit, notifier } = setup();

      await service.processRefund('ord_1', 1500, 9);

      expect(audit.record).toHaveBeenCalledWith({
        actorId: 9,
        action: 'order.refund',
        entityType: 'Order',
        entityId: 'ord_1',
        metadata: {
          amountCents: 1500,
          refundedTotal: 1500,
          fullyRefunded: false,
          stripeRefundId: 're_1',
        },
      });
      expect(notifier.refundProcessed).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'ord_1', email: 'shopper@example.com' }),
        { amountCents: 1500, currency: 'USD' },
      );
    });
  });

  describe('rejections (nothing reserved, Stripe never called)', () => {
    const expectUntouched = (ctx: ReturnType<typeof setup>) => {
      expect(ctx.stripe.refunds.create).not.toHaveBeenCalled();
      expect(ctx.prisma.payment.updateMany).not.toHaveBeenCalled();
      expect(ctx.tx.payment.update).not.toHaveBeenCalled();
      expect(ctx.audit.record).not.toHaveBeenCalled();
    };

    it('404s for an unknown order', async () => {
      const ctx = setup({ orderMissing: true });
      await expect(
        ctx.service.processRefund('nope', undefined, 9),
      ).rejects.toBeInstanceOf(NotFoundException);
      expectUntouched(ctx);
    });

    it('rejects an amount above the refundable balance', async () => {
      const ctx = setup({
        payments: [
          {
            id: 'pay_1',
            amount: 5000,
            refundedAmount: 4000,
            status: PaymentStatus.PARTIALLY_REFUNDED,
            stripePaymentIntentId: 'pi_1',
          },
        ],
      });
      await expect(ctx.service.processRefund('ord_1', 1001, 9)).rejects.toThrow(
        /1000 cents remaining/,
      );
      expectUntouched(ctx);
    });

    it('rejects a payment that is already fully refunded', async () => {
      const ctx = setup({
        payments: [
          {
            id: 'pay_1',
            amount: 5000,
            refundedAmount: 5000,
            status: PaymentStatus.REFUNDED,
            stripePaymentIntentId: 'pi_1',
          },
        ],
      });
      await expect(
        ctx.service.processRefund('ord_1', undefined, 9),
      ).rejects.toThrow(/already fully refunded/);
      expectUntouched(ctx);
    });

    it('rejects an order with no captured payment', async () => {
      const ctx = setup({
        payments: [
          {
            id: 'pay_1',
            amount: 5000,
            refundedAmount: 0,
            status: PaymentStatus.PROCESSING,
            stripePaymentIntentId: 'pi_1',
          },
        ],
      });
      await expect(
        ctx.service.processRefund('ord_1', undefined, 9),
      ).rejects.toBeInstanceOf(BadRequestException);
      expectUntouched(ctx);
    });

    it('rejects a captured payment with no Stripe intent ($0 order)', async () => {
      const ctx = setup({
        payments: [
          {
            id: 'pay_1',
            amount: 0,
            refundedAmount: 0,
            status: PaymentStatus.SUCCEEDED,
            stripePaymentIntentId: null,
          },
        ],
      });
      await expect(
        ctx.service.processRefund('ord_1', undefined, 9),
      ).rejects.toThrow(/no captured payment/);
      expectUntouched(ctx);
    });

    it('503s when Stripe is not configured', async () => {
      const ctx = setup({ noStripe: true });
      await expect(
        ctx.service.processRefund('ord_1', undefined, 9),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(ctx.prisma.payment.updateMany).not.toHaveBeenCalled();
    });
  });

  it('releases the reservation and changes no status when Stripe fails', async () => {
    const ctx = setup({ stripeError: new Error('card_declined') });

    await expect(ctx.service.processRefund('ord_1', 2000, 9)).rejects.toThrow(
      'card_declined',
    );

    expect(ctx.prisma.payment.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'pay_1', refundedAmount: 0 },
      data: { refundedAmount: { increment: 2000 } },
    });
    expect(ctx.prisma.payment.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'pay_1' },
      data: { refundedAmount: { decrement: 2000 } },
    });
    expect(ctx.tx.payment.update).not.toHaveBeenCalled();
    expect(ctx.tx.order.update).not.toHaveBeenCalled();
    expect(ctx.audit.record).not.toHaveBeenCalled();
    expect(ctx.notifier.refundProcessed).not.toHaveBeenCalled();
  });
});
