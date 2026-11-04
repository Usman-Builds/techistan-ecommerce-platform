import {
  BadGatewayException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, PaymentStatus, ReturnStatus, Role } from '@prisma/client';
import { OrderService } from './order.service';
import { ReturnReason } from './dto/create-return.dto';

/**
 * #46: the order lifecycle mutations that move money and stock (cancel,
 * return request / reject, tracking, admin status changes), success and every
 * rejection branch. Prisma is a stub whose transaction client is the same
 * object, so writes made "inside" a transaction are visible to assertions.
 */
const CUSTOMER = { userId: 7, role: Role.CUSTOMER };
const ADMIN = { userId: 1, role: Role.ADMIN };

type Status = OrderStatus;

function setup(
  opts: {
    status?: Status;
    userId?: number | null;
    ret?: { status: ReturnStatus; orderId?: string } | null;
    payment?: { amount: number; refundedAmount: number } | null;
    refundFails?: boolean;
  } = {},
) {
  const order = {
    id: 'o1',
    orderNumber: 'ORD-1',
    email: 'shopper@example.com',
    userId: opts.userId === undefined ? 7 : opts.userId,
    status: opts.status ?? OrderStatus.PENDING,
    grandTotal: 3000,
    discountTotal: 0,
    subtotal: 3000,
    items: [
      {
        id: 'oi1',
        variantId: 'v1',
        sku: 'SKU-1',
        productTitle: 'Lamp',
        quantity: 2,
        unitPrice: 1500,
        total: 3000,
      },
    ],
  };
  const ret =
    opts.ret === null
      ? null
      : {
          id: 'r1',
          orderId: opts.ret?.orderId ?? 'o1',
          status: opts.ret?.status ?? ReturnStatus.REQUESTED,
          reasonCode: 'DEFECTIVE',
          note: 'original note',
          refundAmount: null,
          createdAt: new Date(),
          items: [{ orderItemId: 'oi1', variantId: 'v1', quantity: 1 }],
        };
  const payment =
    opts.payment === null
      ? null
      : {
          id: 'pay1',
          orderId: 'o1',
          status: PaymentStatus.SUCCEEDED,
          stripePaymentIntentId: 'pi_1',
          amount: opts.payment?.amount ?? 3000,
          refundedAmount: opts.payment?.refundedAmount ?? 0,
        };

  const prisma = {
    $transaction: jest.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
    $queryRaw: jest.fn().mockResolvedValue([]),
    order: {
      findUnique: jest.fn(() => Promise.resolve(order)),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(order)),
      update: jest.fn(),
      updateMany: jest.fn(({ where }: { where: { status: Status } }) =>
        Promise.resolve({ count: where.status === order.status ? 1 : 0 }),
      ),
    },
    orderItem: {
      findMany: jest.fn(() => Promise.resolve(order.items)),
    },
    orderNote: { create: jest.fn() },
    payment: { findFirst: jest.fn(() => Promise.resolve(payment)) },
    productVariant: { update: jest.fn() },
    shipmentEvent: { create: jest.fn() },
    returnRequest: {
      findUnique: jest.fn(() => Promise.resolve(ret)),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({
          id: 'r-new',
          refundAmount: null,
          note: null,
          createdAt: new Date(),
          ...data,
        }),
      ),
      update: jest.fn(({ data }: { data: object }) =>
        Promise.resolve({ ...ret, ...data }),
      ),
    },
  };
  const coupon = { releaseRedemptions: jest.fn() };
  const paymentService = {
    cancelOpenIntent: jest.fn(),
    processRefund: jest.fn(() =>
      opts.refundFails
        ? Promise.reject(new Error('card_declined'))
        : Promise.resolve({ amountCents: 3000 }),
    ),
  };
  const audit = { record: jest.fn() };
  const notifier = {
    orderStatusChanged: jest.fn(),
    orderShipped: jest.fn(),
    returnUpdated: jest.fn(),
  };
  const service = new OrderService(
    prisma as never,
    coupon as never,
    paymentService as never,
    {} as never,
    audit as never,
    notifier as never,
  );
  // The read-back after a mutation is covered elsewhere; stub it here.
  jest.spyOn(service, 'getOrder').mockResolvedValue({} as never);
  jest.spyOn(service, 'getAdminOrder').mockResolvedValue({} as never);
  return { service, prisma, coupon, paymentService, audit, notifier, order };
}

describe('OrderService lifecycle mutations (#46)', () => {
  describe('cancelOrder (customer)', () => {
    it('cancels a PENDING order: intent first, then the status', async () => {
      const { service, prisma, paymentService, audit, notifier } = setup();
      await service.cancelOrder('o1', CUSTOMER);
      expect(paymentService.cancelOpenIntent).toHaveBeenCalledWith('o1');
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.CANCELLED },
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'order.cancel' }),
        prisma,
      );
      expect(notifier.orderStatusChanged).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o1' }),
        OrderStatus.CANCELLED,
      );
    });

    it('refuses an order that is no longer PENDING', async () => {
      const { service, prisma, paymentService } = setup({
        status: OrderStatus.CONFIRMED,
      });
      await expect(service.cancelOrder('o1', CUSTOMER)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(paymentService.cancelOpenIntent).not.toHaveBeenCalled();
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it("answers 404 for another customer's order", async () => {
      const { service, paymentService } = setup({ userId: 99 });
      await expect(service.cancelOrder('o1', CUSTOMER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(paymentService.cancelOpenIntent).not.toHaveBeenCalled();
    });

    it('answers 404 for a guest order', async () => {
      const { service } = setup({ userId: null });
      await expect(service.cancelOrder('o1', CUSTOMER)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('requestReturn', () => {
    const dto = (orderItemId = 'oi1', quantity = 1) => ({
      reasonCode: ReturnReason.DEFECTIVE,
      items: [{ orderItemId, quantity }],
    });

    it('records a REQUESTED return with a frozen snapshot', async () => {
      const { service, prisma, notifier } = setup({
        status: OrderStatus.DELIVERED,
      });
      await service.requestReturn('o1', CUSTOMER, dto() as never);
      expect(prisma.returnRequest.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'o1',
          status: ReturnStatus.REQUESTED,
          items: [
            expect.objectContaining({
              orderItemId: 'oi1',
              variantId: 'v1',
              quantity: 1,
              unitPrice: 1500,
            }),
          ],
        }) as unknown,
      });
      expect(notifier.returnUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o1' }),
        'REQUESTED',
      );
    });

    it('refuses an order that has not been delivered', async () => {
      const { service, prisma } = setup({ status: OrderStatus.SHIPPED });
      await expect(
        service.requestReturn('o1', CUSTOMER, dto() as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.returnRequest.create).not.toHaveBeenCalled();
    });

    it("answers 404 for another customer's order", async () => {
      const { service } = setup({
        status: OrderStatus.DELIVERED,
        userId: 99,
      });
      await expect(
        service.requestReturn('o1', CUSTOMER, dto() as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses an item that is not part of the order', async () => {
      const { service, prisma } = setup({ status: OrderStatus.DELIVERED });
      await expect(
        service.requestReturn('o1', CUSTOMER, dto('oi-foreign') as never),
      ).rejects.toThrow('is not part of this order');
      expect(prisma.returnRequest.create).not.toHaveBeenCalled();
    });

    it('refuses more units than were purchased', async () => {
      const { service, prisma } = setup({ status: OrderStatus.DELIVERED });
      await expect(
        service.requestReturn('o1', CUSTOMER, dto('oi1', 3) as never),
      ).rejects.toThrow('only 2 can still be returned');
      expect(prisma.returnRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('rejectReturn', () => {
    it('rejects without restocking or refunding', async () => {
      const { service, prisma, paymentService, notifier } = setup({
        status: OrderStatus.DELIVERED,
      });
      await service.rejectReturn('o1', 'r1', undefined, ADMIN);
      expect(prisma.returnRequest.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: { status: ReturnStatus.REJECTED, note: 'original note' },
      });
      expect(prisma.productVariant.update).not.toHaveBeenCalled();
      expect(paymentService.processRefund).not.toHaveBeenCalled();
      expect(notifier.returnUpdated).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'o1' }),
        'REJECTED',
      );
    });

    it('stores the admin note when one is given', async () => {
      const { service, prisma } = setup({ status: OrderStatus.DELIVERED });
      await service.rejectReturn('o1', 'r1', 'Out of window', ADMIN);
      expect(prisma.returnRequest.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: ReturnStatus.REJECTED, note: 'Out of window' },
        }),
      );
    });

    it('refuses a return that was already resolved', async () => {
      const { service, prisma } = setup({
        ret: { status: ReturnStatus.APPROVED },
      });
      await expect(
        service.rejectReturn('o1', 'r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.returnRequest.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a return that belongs to another order', async () => {
      const { service } = setup({
        ret: { status: ReturnStatus.REQUESTED, orderId: 'o2' },
      });
      await expect(
        service.rejectReturn('o1', 'r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('answers 404 for a missing return', async () => {
      const { service } = setup({ ret: null });
      await expect(
        service.rejectReturn('o1', 'r1', undefined, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('setTracking', () => {
    const dto = { carrier: 'UPS', trackingNumber: '1Z999' };

    it('records the shipment and moves a CONFIRMED order to SHIPPED', async () => {
      const { service, prisma, notifier } = setup({
        status: OrderStatus.CONFIRMED,
      });
      await service.setTracking('o1', dto as never, ADMIN);
      expect(prisma.shipmentEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'o1',
          carrier: 'UPS',
          trackingNumber: '1Z999',
          trackingUrl: 'https://www.ups.com/track?tracknum=1Z999',
        }) as unknown,
      });
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.SHIPPED },
      });
      expect(notifier.orderShipped).toHaveBeenCalledTimes(1);
    });

    it('adds tracking to a SHIPPED order without another status change', async () => {
      const { service, prisma } = setup({ status: OrderStatus.SHIPPED });
      await service.setTracking('o1', dto as never, ADMIN);
      expect(prisma.shipmentEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('refuses an unpaid (PENDING) order', async () => {
      const { service, prisma } = setup({ status: OrderStatus.PENDING });
      await expect(
        service.setTracking('o1', dto as never, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shipmentEvent.create).not.toHaveBeenCalled();
    });

    it('refuses a DELIVERED order', async () => {
      const { service } = setup({ status: OrderStatus.DELIVERED });
      await expect(
        service.setTracking('o1', dto as never, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('answers 404 for a missing order', async () => {
      const { service, prisma } = setup();
      prisma.order.findUnique.mockResolvedValueOnce(null as never);
      await expect(
        service.setTracking('o1', dto as never, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateStatus (admin)', () => {
    it('applies a legal transition with its note and audit row', async () => {
      const { service, prisma, audit } = setup({
        status: OrderStatus.CONFIRMED,
      });
      await service.updateStatus(
        'o1',
        OrderStatus.PROCESSING,
        'Packing now',
        ADMIN,
      );
      expect(prisma.order.update).toHaveBeenCalledWith({
        where: { id: 'o1' },
        data: { status: OrderStatus.PROCESSING },
      });
      expect(prisma.orderNote.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: 'Packing now' }) as unknown,
      });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'order.status',
          metadata: {
            from: OrderStatus.CONFIRMED,
            to: OrderStatus.PROCESSING,
          },
        }),
        prisma,
      );
    });

    it('refuses REFUNDED (that goes through the refund action)', async () => {
      const { service, prisma } = setup({ status: OrderStatus.CONFIRMED });
      await expect(
        service.updateStatus('o1', OrderStatus.REFUNDED, undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
    });

    it('refuses an illegal transition', async () => {
      const { service, prisma } = setup({ status: OrderStatus.DELIVERED });
      await expect(
        service.updateStatus('o1', OrderStatus.CANCELLED, undefined, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing order', async () => {
      const { service, prisma } = setup();
      prisma.order.findUnique.mockResolvedValueOnce(null as never);
      await expect(
        service.updateStatus('o1', OrderStatus.CANCELLED, undefined, ADMIN),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    describe('cancelling a paid order (#7)', () => {
      it('refunds, restocks each line once and releases the coupon', async () => {
        const { service, prisma, coupon, paymentService } = setup({
          status: OrderStatus.CONFIRMED,
        });
        await service.updateStatus(
          'o1',
          OrderStatus.CANCELLED,
          undefined,
          ADMIN,
        );
        expect(paymentService.processRefund).toHaveBeenCalledWith(
          'o1',
          undefined,
          ADMIN.userId,
        );
        expect(prisma.productVariant.update).toHaveBeenCalledTimes(1);
        expect(prisma.productVariant.update).toHaveBeenCalledWith({
          where: { id: 'v1' },
          data: { stock: { increment: 2 } },
        });
        expect(coupon.releaseRedemptions).toHaveBeenCalledWith(prisma, 'o1');
      });

      it('skips the refund when nothing is left to refund', async () => {
        const { service, prisma, paymentService } = setup({
          status: OrderStatus.PROCESSING,
          payment: { amount: 3000, refundedAmount: 3000 },
        });
        await service.updateStatus(
          'o1',
          OrderStatus.CANCELLED,
          undefined,
          ADMIN,
        );
        expect(paymentService.processRefund).not.toHaveBeenCalled();
        expect(prisma.productVariant.update).toHaveBeenCalledTimes(1);
      });

      it('puts the order back and restocks nothing when the refund fails', async () => {
        const { service, prisma, coupon } = setup({
          status: OrderStatus.CONFIRMED,
          refundFails: true,
        });
        await expect(
          service.updateStatus('o1', OrderStatus.CANCELLED, undefined, ADMIN),
        ).rejects.toBeInstanceOf(BadGatewayException);
        expect(prisma.order.updateMany).toHaveBeenLastCalledWith({
          where: { id: 'o1', status: OrderStatus.CANCELLED },
          data: { status: OrderStatus.CONFIRMED },
        });
        expect(prisma.productVariant.update).not.toHaveBeenCalled();
        expect(coupon.releaseRedemptions).not.toHaveBeenCalled();
      });

      it('refuses when the order changed in the meantime', async () => {
        const { service, prisma, paymentService } = setup({
          status: OrderStatus.CONFIRMED,
        });
        prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });
        await expect(
          service.updateStatus('o1', OrderStatus.CANCELLED, undefined, ADMIN),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(paymentService.processRefund).not.toHaveBeenCalled();
      });
    });
  });
});
