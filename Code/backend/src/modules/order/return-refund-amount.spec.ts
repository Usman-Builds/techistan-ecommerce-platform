import {
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PaymentStatus, ReturnStatus } from '@prisma/client';
import { OrderService, type ReturnItemSnapshot } from './order.service';

/**
 * Return refunds pay back what the customer actually paid for the returned
 * units (#10): the line total minus its share of the order discount, capped at
 * the payment's refundable balance. A refund failure other than "Stripe not
 * configured" must not approve the return with a silent $0 refund.
 */
type Payment = {
  status: PaymentStatus;
  amount: number;
  refundedAmount: number;
};

function setup(opts: {
  subtotal: number;
  discountTotal: number;
  payments: Payment[];
  items: ReturnItemSnapshot[];
  refund?: (amount: number) => Promise<{ amountCents: number }>;
}) {
  const ret = {
    id: 'r1',
    orderId: 'o1',
    reasonCode: 'DEFECTIVE',
    status: ReturnStatus.REQUESTED as ReturnStatus,
    note: null as string | null,
    items: opts.items,
    refundAmount: null as number | null,
    createdAt: new Date(),
  };
  const stock: Record<string, number> = { v1: 10, v2: 10 };
  const returnRequest = {
    findUnique: jest.fn(() => Promise.resolve({ ...ret })),
    updateMany: jest.fn(
      ({
        where,
        data,
      }: {
        where: { status?: ReturnStatus };
        data: Partial<typeof ret>;
      }) => {
        if (where.status && ret.status !== where.status) {
          return Promise.resolve({ count: 0 });
        }
        Object.assign(ret, data);
        return Promise.resolve({ count: 1 });
      },
    ),
    update: jest.fn(({ data }: { data: Partial<typeof ret> }) => {
      Object.assign(ret, data);
      return Promise.resolve({ ...ret });
    }),
  };
  const productVariant = {
    update: jest.fn(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: { stock: { increment?: number; decrement?: number } };
      }) => {
        stock[where.id] +=
          (data.stock.increment ?? 0) - (data.stock.decrement ?? 0);
        return Promise.resolve({});
      },
    ),
  };
  const tx = { returnRequest, productVariant };
  const prisma = {
    ...tx,
    order: {
      findUniqueOrThrow: jest.fn(() =>
        Promise.resolve({
          id: 'o1',
          subtotal: opts.subtotal,
          discountTotal: opts.discountTotal,
          payments: opts.payments,
        }),
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const payment = {
    processRefund: jest.fn((_orderId: string, amount: number) =>
      opts.refund
        ? opts.refund(amount)
        : Promise.resolve({ amountCents: amount }),
    ),
  };
  const service = new OrderService(
    prisma as never,
    {} as never,
    payment as never,
    {} as never,
    { record: jest.fn() } as never,
    { returnUpdated: jest.fn() } as never,
  );
  const approve = () =>
    service.approveReturn('o1', 'r1', undefined, {
      userId: 1,
      role: 'ADMIN',
    } as never);
  return { approve, payment, ret, stock };
}

const item = (
  id: string,
  quantity: number,
  unitPrice: number,
): ReturnItemSnapshot => ({
  orderItemId: `oi-${id}`,
  variantId: id,
  sku: `SKU-${id}`,
  productTitle: `Item ${id}`,
  quantity,
  unitPrice,
});

const paid = (amount: number, refundedAmount = 0): Payment => ({
  status:
    refundedAmount > 0
      ? PaymentStatus.PARTIALLY_REFUNDED
      : PaymentStatus.SUCCEEDED,
  amount,
  refundedAmount,
});

describe('OrderService.approveReturn refund amount (#10)', () => {
  it('nets the coupon out of the refund (60% off: refunds 4000, not 10000)', async () => {
    // 1 × $100, 60% coupon → paid $40 + $5 shipping = 4500.
    const { approve, payment, ret } = setup({
      subtotal: 10000,
      discountTotal: 6000,
      payments: [paid(4500)],
      items: [item('v1', 1, 10000)],
    });
    await approve();
    expect(payment.processRefund).toHaveBeenCalledWith('o1', 4000, 1);
    expect(ret.status).toBe(ReturnStatus.APPROVED);
    expect(ret.refundAmount).toBe(4000);
  });

  it('prorates the discount by line value when only some items come back', async () => {
    // 2 lines of 5000, 10% off the order → each line cost 4500.
    const { approve, payment } = setup({
      subtotal: 10000,
      discountTotal: 1000,
      payments: [paid(9500)],
      items: [item('v1', 1, 5000)],
    });
    await approve();
    expect(payment.processRefund).toHaveBeenCalledWith('o1', 4500, 1);
  });

  it('caps the refund at what is still refundable', async () => {
    const { approve, payment } = setup({
      subtotal: 10000,
      discountTotal: 0,
      payments: [paid(10500, 8000)],
      items: [item('v1', 1, 10000)],
    });
    await approve();
    expect(payment.processRefund).toHaveBeenCalledWith('o1', 2500, 1);
  });

  it('approves with no refund call when nothing is refundable', async () => {
    const { approve, payment, ret, stock } = setup({
      subtotal: 10000,
      discountTotal: 0,
      payments: [
        {
          status: PaymentStatus.REFUNDED,
          amount: 10500,
          refundedAmount: 10500,
        },
      ],
      items: [item('v1', 1, 10000)],
    });
    await approve();
    expect(payment.processRefund).not.toHaveBeenCalled();
    expect(ret.status).toBe(ReturnStatus.APPROVED);
    expect(ret.refundAmount).toBe(0);
    expect(stock.v1).toBe(11);
  });

  it('still approves with a zero refund when Stripe is not configured', async () => {
    const { approve, ret } = setup({
      subtotal: 10000,
      discountTotal: 0,
      payments: [paid(10500)],
      items: [item('v1', 1, 10000)],
      refund: () =>
        Promise.reject(new ServiceUnavailableException('not configured')),
    });
    await approve();
    expect(ret.status).toBe(ReturnStatus.APPROVED);
    expect(ret.refundAmount).toBe(0);
  });

  it('does not silently approve when the refund is refused', async () => {
    const { approve, ret, stock } = setup({
      subtotal: 10000,
      discountTotal: 0,
      payments: [paid(10500)],
      items: [item('v1', 1, 10000)],
      refund: () =>
        Promise.reject(
          new BadRequestException('Refund exceeds the refundable amount'),
        ),
    });
    await expect(approve()).rejects.toBeInstanceOf(BadRequestException);
    expect(ret.status).toBe(ReturnStatus.REQUESTED);
    expect(stock.v1).toBe(10);
  });
});
