import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PaymentService, RECONCILE_INTERVAL_MS } from './payment.service';

/**
 * Card-only intents and the webhook fallback (reconcile). The exactly-once
 * guard matters most here: a webhook and a polling client can both try to
 * confirm the same payment, and stock must only ever be decremented once.
 */
function setup(
  opts: {
    intentStatus?: string;
    lastPaymentError?: boolean;
    updateCount?: number;
    noStripe?: boolean;
  } = {},
) {
  const intent = {
    id: 'pi_1',
    status: opts.intentStatus ?? 'succeeded',
    payment_method_types: ['card'],
    last_payment_error: opts.lastPaymentError ? { message: 'declined' } : null,
  };
  const stripe = {
    paymentIntents: {
      retrieve: jest.fn().mockResolvedValue(intent),
      create: jest
        .fn()
        .mockResolvedValue({ id: 'pi_new', client_secret: 'secret' }),
    },
  };
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
          email: 'shopper@example.com',
          userId: 1,
          currency: 'USD',
          subtotal: 1000,
          shippingTotal: 0,
          taxTotal: 0,
          discountTotal: 0,
          grandTotal: 1000,
          couponCode: null,
          cartId: 'cart_1',
          items: [
            {
              variantId: 'var_1',
              quantity: 2,
              productTitle: 'Thing',
              variantOptions: null,
              unitPrice: 500,
              total: 1000,
            },
          ],
        },
      }),
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
    },
    order: { update: jest.fn() },
    productVariant: { update: jest.fn() },
    cartItem: { deleteMany: jest.fn() },
    cart: { updateMany: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    payment: { update: jest.fn() },
  };
  const config = { get: jest.fn().mockReturnValue('whsec_test') };
  const notifier = { orderConfirmed: jest.fn().mockResolvedValue(undefined) };

  const service = new PaymentService(
    (opts.noStripe ? null : stripe) as unknown as Stripe,
    prisma as never,
    config as never,
    { recordRedemption: jest.fn() } as never,
    {} as never,
    notifier as never,
  );
  return { service, stripe, tx, prisma, notifier, intent };
}

describe('PaymentService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates card-only PaymentIntents', async () => {
    const { service, stripe } = setup();
    await service.createIntent({
      orderId: 'ord_1',
      paymentId: 'pay_1',
      amountCents: 1000,
      currency: 'USD',
    });
    const params = stripe.paymentIntents.create.mock.calls[0][0];
    expect(params.payment_method_types).toEqual(['card']);
    expect(params).not.toHaveProperty('automatic_payment_methods');
  });

  describe('reconcile', () => {
    it('confirms the order when Stripe says the intent succeeded', async () => {
      const { service, tx, notifier } = setup();

      await expect(service.reconcile('pi_1')).resolves.toBe(true);

      expect(tx.processedWebhookEvent.create).not.toHaveBeenCalled();
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: PaymentStatus.SUCCEEDED, method: 'card' },
        }),
      );
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: { status: OrderStatus.CONFIRMED },
      });
      expect(tx.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'var_1' },
        data: { stock: { decrement: 2 } },
      });
      expect(notifier.orderConfirmed).toHaveBeenCalledTimes(1);
    });

    it('applies no side effects when the payment was already settled', async () => {
      // e.g. the webhook won the race and the conditional update matched nothing
      const { service, tx, notifier } = setup({ updateCount: 0 });

      await expect(service.reconcile('pi_1')).resolves.toBe(false);

      expect(tx.order.update).not.toHaveBeenCalled();
      expect(tx.productVariant.update).not.toHaveBeenCalled();
      expect(tx.cartItem.deleteMany).not.toHaveBeenCalled();
      expect(notifier.orderConfirmed).not.toHaveBeenCalled();
    });

    it('looks an intent up at most once per interval', async () => {
      const { service, stripe } = setup({ intentStatus: 'processing' });
      const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

      await service.reconcile('pi_1');
      await service.reconcile('pi_1');
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(1);

      now.mockReturnValue(1_000_000 + RECONCILE_INTERVAL_MS);
      await service.reconcile('pi_1');
      expect(stripe.paymentIntents.retrieve).toHaveBeenCalledTimes(2);
    });

    it('marks a declined intent FAILED', async () => {
      const { service, tx } = setup({
        intentStatus: 'requires_payment_method',
        lastPaymentError: true,
      });

      await expect(service.reconcile('pi_1')).resolves.toBe(true);
      expect(tx.payment.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: PaymentStatus.FAILED } }),
      );
    });

    it('leaves an intent that has not been attempted yet alone', async () => {
      const { service, prisma } = setup({
        intentStatus: 'requires_payment_method',
      });

      await expect(service.reconcile('pi_1')).resolves.toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('returns false instead of throwing when Stripe errors', async () => {
      const { service, stripe } = setup();
      stripe.paymentIntents.retrieve.mockRejectedValue(new Error('timeout'));

      await expect(service.reconcile('pi_1')).resolves.toBe(false);
    });

    it('does nothing when Stripe is not configured', async () => {
      const { service, prisma } = setup({ noStripe: true });

      await expect(service.reconcile('pi_1')).resolves.toBe(false);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('webhook', () => {
    const succeeded = (intent: unknown) =>
      ({
        id: 'evt_1',
        type: 'payment_intent.succeeded',
        data: { object: intent },
      }) as unknown as Stripe.Event;

    it('records the event id and confirms the order', async () => {
      const { service, tx, intent } = setup();

      await service.handleEvent(succeeded(intent));

      expect(tx.processedWebhookEvent.create).toHaveBeenCalledWith({
        data: { id: 'evt_1', type: 'payment_intent.succeeded' },
      });
      expect(tx.order.update).toHaveBeenCalledTimes(1);
    });

    it('ignores a redelivered event', async () => {
      const { service, tx, intent, notifier } = setup();
      tx.processedWebhookEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(
        service.handleEvent(succeeded(intent)),
      ).resolves.toBeUndefined();
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(notifier.orderConfirmed).not.toHaveBeenCalled();
    });
  });
});
