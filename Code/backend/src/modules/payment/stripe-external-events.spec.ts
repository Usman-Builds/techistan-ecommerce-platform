import { OrderStatus, PaymentStatus, Prisma } from '@prisma/client';
import type Stripe from 'stripe';
import { PaymentService } from './payment.service';

/**
 * #43: refunds made in the Stripe Dashboard, disputes and cancelled intents
 * are synced from their webhooks, once per event.
 */
function setup(payment: { amount: number; refundedAmount: number } | null) {
  const row = payment && {
    id: 'pay_1',
    orderId: 'ord_1',
    status: PaymentStatus.SUCCEEDED,
    ...payment,
  };
  const tx = {
    processedWebhookEvent: { create: jest.fn() },
    payment: {
      findUnique: jest.fn(() => Promise.resolve(row)),
      update: jest.fn(),
      updateMany: jest.fn(() => Promise.resolve({ count: 1 })),
    },
    order: { update: jest.fn() },
    orderNote: { create: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const audit = { record: jest.fn() };
  const service = new PaymentService(
    {} as unknown as Stripe,
    prisma as never,
    { get: jest.fn().mockReturnValue('whsec_test') } as never,
    {} as never,
    audit as never,
    {} as never,
  );
  return { service, tx, audit };
}

const event = (type: string, object: object, id = 'evt_1') =>
  ({ id, type, data: { object } }) as unknown as Stripe.Event;

const charge = (amountRefunded: number) => ({
  id: 'ch_1',
  payment_intent: 'pi_1',
  amount_refunded: amountRefunded,
});

describe('PaymentService external Stripe events (#43)', () => {
  describe('charge.refunded', () => {
    it('records a partial Dashboard refund', async () => {
      const { service, tx, audit } = setup({ amount: 5000, refundedAmount: 0 });
      await service.handleEvent(event('charge.refunded', charge(2000)));
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_1' },
        data: {
          refundedAmount: 2000,
          status: PaymentStatus.PARTIALLY_REFUNDED,
        },
      });
      expect(tx.order.update).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order.refund.external' }),
      );
    });

    it('marks payment and order REFUNDED on a full refund', async () => {
      const { service, tx } = setup({ amount: 5000, refundedAmount: 2000 });
      await service.handleEvent(event('charge.refunded', charge(5000)));
      expect(tx.payment.update).toHaveBeenCalledWith({
        where: { id: 'pay_1' },
        data: { refundedAmount: 5000, status: PaymentStatus.REFUNDED },
      });
      expect(tx.order.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: { status: OrderStatus.REFUNDED },
      });
    });

    it('changes nothing for the echo of a refund we already recorded', async () => {
      const { service, tx, audit } = setup({
        amount: 5000,
        refundedAmount: 2000,
      });
      await service.handleEvent(event('charge.refunded', charge(2000)));
      expect(tx.payment.update).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    });

    it('ignores a redelivered event', async () => {
      const { service, tx } = setup({ amount: 5000, refundedAmount: 0 });
      tx.processedWebhookEvent.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );
      await expect(
        service.handleEvent(event('charge.refunded', charge(2000))),
      ).resolves.toBeUndefined();
      expect(tx.payment.update).not.toHaveBeenCalled();
    });
  });

  describe('charge.dispute.*', () => {
    const dispute = {
      id: 'dp_1',
      payment_intent: 'pi_1',
      amount: 5000,
      currency: 'usd',
      reason: 'fraudulent',
      status: 'needs_response',
    };

    it('flags an opened dispute on the order for admins', async () => {
      const { service, tx, audit } = setup({ amount: 5000, refundedAmount: 0 });
      await service.handleEvent(event('charge.dispute.created', dispute));
      expect(tx.orderNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'ord_1',
          body: expect.stringContaining(
            'dispute opened (fraudulent)',
          ) as unknown,
        }) as unknown,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order.dispute.open' }),
      );
    });

    it('records the outcome when the dispute closes', async () => {
      const { service, tx } = setup({ amount: 5000, refundedAmount: 0 });
      await service.handleEvent(
        event('charge.dispute.closed', { ...dispute, status: 'lost' }),
      );
      expect(tx.orderNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining('closed: lost') as unknown,
        }) as unknown,
      });
    });
  });

  describe('payment_intent.canceled', () => {
    it('moves an unpaid payment to FAILED', async () => {
      const { service, tx } = setup({ amount: 5000, refundedAmount: 0 });
      await service.handleEvent(
        event('payment_intent.canceled', { id: 'pi_1' }),
      );
      expect(tx.payment.updateMany).toHaveBeenCalledWith({
        where: {
          stripePaymentIntentId: 'pi_1',
          status: {
            in: [PaymentStatus.REQUIRES_PAYMENT, PaymentStatus.PROCESSING],
          },
        },
        data: { status: PaymentStatus.FAILED },
      });
    });
  });

  it('ignores events for intents it does not know', async () => {
    const { service, tx, audit } = setup(null);
    await service.handleEvent(event('charge.refunded', charge(100)));
    expect(tx.payment.update).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });
});
