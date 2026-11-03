import { BadRequestException } from '@nestjs/common';
import { OrderStatus, ReturnStatus, Role } from '@prisma/client';
import { OrderService } from './order.service';
import { ReturnReason } from './dto/create-return.dto';

/**
 * A customer may return each purchased unit once (#9). Units covered by an
 * earlier REQUESTED or APPROVED return count against the purchased quantity;
 * REJECTED returns free their units again. The Prisma stub keeps return rows in
 * memory so repeated calls see each other.
 */
function setup(existing: { status: ReturnStatus; quantity: number }[] = []) {
  const order = {
    id: 'o1',
    userId: 7,
    status: OrderStatus.DELIVERED,
    email: 'a@example.com',
    orderNumber: 'ORD-1',
    items: [
      {
        id: 'oi1',
        variantId: 'v1',
        sku: 'SKU-1',
        productTitle: 'Thing',
        quantity: 2,
        unitPrice: 1500,
      },
      {
        id: 'oi2',
        variantId: 'v2',
        sku: 'SKU-2',
        productTitle: 'Other',
        quantity: 1,
        unitPrice: 900,
      },
    ],
  };
  const returns = existing.map((e, i) => ({
    id: `r${i}`,
    orderId: 'o1',
    reasonCode: 'OTHER',
    status: e.status,
    note: null,
    refundAmount: null,
    createdAt: new Date(),
    items: [{ orderItemId: 'oi1', quantity: e.quantity }],
  }));

  const returnRequest = {
    findMany: jest.fn(
      ({
        where,
      }: {
        where: { orderId: string; status: { not: ReturnStatus } };
      }) =>
        Promise.resolve(
          returns.filter(
            (r) => r.orderId === where.orderId && r.status !== where.status.not,
          ),
        ),
    ),
    create: jest.fn(
      ({ data }: { data: { items: unknown; reasonCode: string } }) => {
        const row = {
          id: `r${returns.length}`,
          orderId: 'o1',
          reasonCode: data.reasonCode,
          status: ReturnStatus.REQUESTED,
          note: null,
          refundAmount: null,
          createdAt: new Date(),
          items: data.items as { orderItemId: string; quantity: number }[],
        };
        returns.push(row);
        return Promise.resolve(row);
      },
    ),
  };
  const tx = { returnRequest, $queryRaw: jest.fn(() => Promise.resolve([])) };
  const prisma = {
    ...tx,
    order: { findUnique: jest.fn(() => Promise.resolve(order)) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const service = new OrderService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
    { record: jest.fn() } as never,
    { returnUpdated: jest.fn() } as never,
  );
  const actor = { userId: 7, role: Role.CUSTOMER };
  const request = (items: { orderItemId: string; quantity: number }[]) =>
    service.requestReturn('o1', actor, {
      reasonCode: ReturnReason.DEFECTIVE,
      items,
    });
  return { request, returns, tx };
}

describe('OrderService.requestReturn quantity cap (#9)', () => {
  it('rejects a second return for units that are already being returned', async () => {
    const { request, returns } = setup();
    await request([{ orderItemId: 'oi1', quantity: 2 }]);
    await expect(
      request([{ orderItemId: 'oi1', quantity: 1 }]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(returns).toHaveLength(1);
  });

  it('counts APPROVED returns against the purchased quantity', async () => {
    const { request } = setup([{ status: ReturnStatus.APPROVED, quantity: 1 }]);
    await expect(
      request([{ orderItemId: 'oi1', quantity: 2 }]),
    ).rejects.toThrow(/only 1 can still be returned/);
    await expect(
      request([{ orderItemId: 'oi1', quantity: 1 }]),
    ).resolves.toMatchObject({ status: ReturnStatus.REQUESTED });
  });

  it('lets units from a REJECTED return be requested again', async () => {
    const { request } = setup([{ status: ReturnStatus.REJECTED, quantity: 2 }]);
    await expect(
      request([{ orderItemId: 'oi1', quantity: 2 }]),
    ).resolves.toMatchObject({ status: ReturnStatus.REQUESTED });
  });

  it('rejects the same line listed twice in one request', async () => {
    const { request, returns } = setup();
    await expect(
      request([
        { orderItemId: 'oi1', quantity: 2 },
        { orderItemId: 'oi1', quantity: 2 },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(returns).toHaveLength(0);
  });

  it('still allows other lines of the same order', async () => {
    const { request } = setup([
      { status: ReturnStatus.REQUESTED, quantity: 2 },
    ]);
    await expect(
      request([{ orderItemId: 'oi2', quantity: 1 }]),
    ).resolves.toMatchObject({ status: ReturnStatus.REQUESTED });
  });

  it('checks and creates under a lock on the order row', async () => {
    const { request, tx } = setup();
    await request([{ orderItemId: 'oi1', quantity: 1 }]);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
