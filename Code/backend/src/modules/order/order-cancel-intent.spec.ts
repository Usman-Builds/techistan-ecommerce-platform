import { BadRequestException } from '@nestjs/common';
import { OrderStatus, Role } from '@prisma/client';
import { OrderService } from './order.service';

/**
 * #3: cancelling an unpaid order (customer self-cancel or admin status change)
 * first cancels its PaymentIntent, so it can't be paid from another tab. If
 * Stripe refuses (the payment is already going through), the order stays as is.
 */
function setup(cancelImpl?: () => Promise<void>) {
  const order = {
    id: 'o1',
    userId: 7,
    status: OrderStatus.PENDING,
    email: 'a@example.com',
    orderNumber: 'ORD-1',
  };
  const tx = {
    order: { update: jest.fn() },
    orderNote: { create: jest.fn() },
  };
  const prisma = {
    order: { findUnique: jest.fn(() => Promise.resolve({ ...order })) },
    $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  const payment = {
    cancelOpenIntent: jest.fn(cancelImpl ?? (() => Promise.resolve())),
  };
  const service = new OrderService(
    prisma as never,
    {} as never,
    payment as never,
    {} as never,
    { record: jest.fn() } as never,
    { orderStatusChanged: jest.fn() } as never,
  );
  // The read-back after the change is not under test here.
  jest.spyOn(service, 'getOrder').mockResolvedValue({} as never);
  jest.spyOn(service, 'getAdminOrder').mockResolvedValue({} as never);
  return { service, payment, tx };
}

const customer = { userId: 7, role: Role.CUSTOMER };
const admin = { userId: 1, role: Role.ADMIN };

describe('Order cancellation cancels the PaymentIntent (#3)', () => {
  it('customer cancel cancels the intent before the order', async () => {
    const { service, payment, tx } = setup();
    await service.cancelOrder('o1', customer);
    expect(payment.cancelOpenIntent).toHaveBeenCalledWith('o1');
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { status: OrderStatus.CANCELLED },
    });
  });

  it('admin cancel of a PENDING order cancels the intent too', async () => {
    const { service, payment } = setup();
    await service.updateStatus('o1', OrderStatus.CANCELLED, undefined, admin);
    expect(payment.cancelOpenIntent).toHaveBeenCalledWith('o1');
  });

  it('leaves the order alone when Stripe refuses the cancel', async () => {
    const { service, tx } = setup(() =>
      Promise.reject(new BadRequestException('already being paid')),
    );
    await expect(service.cancelOrder('o1', customer)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.order.update).not.toHaveBeenCalled();
  });
});
