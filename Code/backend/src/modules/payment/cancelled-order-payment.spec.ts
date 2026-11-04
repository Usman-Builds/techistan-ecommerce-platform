import { BadRequestException } from '@nestjs/common';
import { OrderStatus, PaymentStatus } from '@prisma/client';
import type Stripe from 'stripe';
import { PaymentService } from './payment.service';

/**
 * #3: a cancelled order must never be paid back to life. Cancelling cancels the
 * PaymentIntent at Stripe; a success that still arrives for a non-PENDING order
 * applies no side effects and is refunded instead.
 */
function setup(
  opts: {
    orderStatus?: OrderStatus;
    stripePaymentIntentId?: string | null;
    cancelFails?: boolean;
    retrievedStatus?: string;
  } = {},
) {
  const stripe = {
    paymentIntents: {
      cancel: jest.fn(() =>
        opts.cancelFails
          ? Promise.reject(new Error('payment_intent_unexpected_state'))
          : Promise.resolve({ id: 'pi_1', status: 'canceled' }),
      ),
      retrieve: jest.fn(() =>
        Promise.resolve({
          id: 'pi_1',
          status: opts.retrievedStatus ?? 'canceled',
        }),
      ),
    },
  };
  const orderStatus = opts.orderStatus ?? OrderStatus.CANCELLED;
  const tx = {
    processedWebhookEvent: { create: jest.fn() },
    payment: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'pay_1',
        orderId: 'ord_1',
        method: null,
        order: {
          id: 'ord_1',
          orderNumber: 'ORD-1',
          status: orderStatus,
          email: 'shopper@example.com',
          userId: 1,
          couponCode: 'SAVE10',
          cartId: 'cart_1',
          items: [{ variantId: 'var_1', quantity: 2 }],
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    order: {
      update: jest.fn(),
      updateMany: jest.fn(({ where }: { where: { status: OrderStatus } }) =>
        Promise.resolve({ count: where.status === orderStatus ? 1 : 0 }),
      ),
    },
    productVariant: {
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ stock: 50 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    storeSetting: { findFirst: jest.fn().mockResolvedValue(null) },
    cartItem: { deleteMany: jest.fn() },
    cart: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    payment: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'pay_1',
        status: PaymentStatus.PROCESSING,
        stripePaymentIntentId:
          opts.stripePaymentIntentId === undefined
            ? 'pi_1'
            : opts.stripePaymentIntentId,
      }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const coupon = { recordRedemption: jest.fn() };
  const notifier = { orderConfirmed: jest.fn() };
  const service = new PaymentService(
    stripe as unknown as Stripe,
    prisma as never,
    { get: jest.fn().mockReturnValue('whsec_test') } as never,
    coupon as never,
    {} as never,
    notifier as never,
  );
  const processRefund = jest
    .spyOn(service, 'processRefund')
    .mockResolvedValue({} as never);
  const succeeded = {
    id: 'evt_1',
    type: 'payment_intent.succeeded',
    data: { object: { id: 'pi_1', payment_method_types: ['card'] } },
  } as unknown as Stripe.Event;
  return {
    service,
    stripe,
    tx,
    prisma,
    coupon,
    notifier,
    processRefund,
    succeeded,
  };
}

describe('PaymentService and cancelled orders (#3)', () => {
  describe('a success that arrives after the order was cancelled', () => {
    it('does not move the order to CONFIRMED or apply side effects', async () => {
      const { service, tx, coupon, notifier, succeeded } = setup();

      await service.handleEvent(succeeded);

      expect(tx.order.updateMany).toHaveBeenCalledWith({
        where: { id: 'ord_1', status: OrderStatus.PENDING },
        data: { status: OrderStatus.CONFIRMED },
      });
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(tx.productVariant.update).not.toHaveBeenCalled();
      expect(tx.productVariant.updateMany).not.toHaveBeenCalled();
      expect(coupon.recordRedemption).not.toHaveBeenCalled();
      expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(notifier.orderConfirmed).not.toHaveBeenCalled();
    });

    it('refunds the captured payment in full', async () => {
      const { service, processRefund, succeeded } = setup();
      await service.handleEvent(succeeded);
      expect(processRefund).toHaveBeenCalledWith('ord_1', undefined, null);
    });

    it('still confirms a PENDING order normally', async () => {
      const { service, tx, notifier, processRefund, succeeded } = setup({
        orderStatus: OrderStatus.PENDING,
      });
      await service.handleEvent(succeeded);
      expect(tx.productVariant.updateMany).toHaveBeenCalledTimes(1);
      expect(notifier.orderConfirmed).toHaveBeenCalledTimes(1);
      expect(processRefund).not.toHaveBeenCalled();
    });
  });

  describe('cancelOpenIntent', () => {
    it('cancels the intent at Stripe and marks the payment FAILED', async () => {
      const { service, stripe, prisma } = setup();
      await service.cancelOpenIntent('ord_1');
      expect(stripe.paymentIntents.cancel).toHaveBeenCalledWith('pi_1');
      expect(prisma.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: 'pay_1' }) as unknown,
          data: { status: PaymentStatus.FAILED },
        }),
      );
    });

    it('refuses when Stripe says the intent is already succeeding', async () => {
      const { service, prisma } = setup({
        cancelFails: true,
        retrievedStatus: 'succeeded',
      });
      await expect(service.cancelOpenIntent('ord_1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.payment.updateMany).not.toHaveBeenCalled();
    });

    it('accepts an intent Stripe had already cancelled', async () => {
      const { service, prisma } = setup({
        cancelFails: true,
        retrievedStatus: 'canceled',
      });
      await service.cancelOpenIntent('ord_1');
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
    });

    it('needs no Stripe call when no intent was created', async () => {
      const { service, stripe, prisma } = setup({
        stripePaymentIntentId: null,
      });
      await service.cancelOpenIntent('ord_1');
      expect(stripe.paymentIntents.cancel).not.toHaveBeenCalled();
      expect(prisma.payment.updateMany).toHaveBeenCalledTimes(1);
    });
  });
});
