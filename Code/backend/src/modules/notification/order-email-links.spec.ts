import type { ReactElement } from 'react';
import { EmailService } from '../email/email.service';
import { NotifierService } from './notifier.service';

/**
 * #35: the "View order" link in every order email opens the order. The
 * storefront looks orders up by id, so the link must carry the id (never the
 * order number): /account/orders/<id> for an account order, and the guest
 * confirmation page /checkout/confirmation?orderId=<id> for a guest order.
 */
function setup() {
  const config = {
    get: jest.fn((key: string) =>
      key === 'userAppUrl' ? 'https://shop.example' : undefined,
    ),
  };
  const prisma = {
    storeSetting: { findFirst: jest.fn(() => Promise.resolve(null)) },
  };
  const email = new EmailService(config as never, prisma as never);
  const sent: { to: unknown; orderUrl: string }[] = [];
  jest.spyOn(email, 'enqueueEmail').mockImplementation((job) => {
    const props = (job.react as ReactElement<{ orderUrl?: string }>).props;
    if (props.orderUrl) sent.push({ to: job.to, orderUrl: props.orderUrl });
    return Promise.resolve(true);
  });
  const notifications = {
    create: jest.fn(() => Promise.resolve()),
    createForAdmins: jest.fn(() => Promise.resolve()),
  };
  const notifier = new NotifierService(
    email,
    notifications as never,
    { sendSms: jest.fn() } as never,
    config as never,
  );
  return { notifier, sent };
}

const accountOrder = {
  id: 'cmorder123',
  orderNumber: 'ORD-20261103-1459',
  email: 'alice@example.com',
  userId: 4,
};
const guestOrder = { ...accountOrder, id: 'cmguest456', userId: null };
const flush = () => new Promise((r) => setImmediate(r));

describe('Order email links (#35)', () => {
  it('links account orders to /account/orders/<id>', async () => {
    const { notifier, sent } = setup();
    await notifier.orderShipped(accountOrder, {
      carrier: 'UPS',
      trackingNumber: '1Z',
      trackingUrl: null,
    });
    await notifier.orderStatusChanged(accountOrder, 'DELIVERED');
    await notifier.refundProcessed(accountOrder, {
      amountCents: 500,
      currency: 'USD',
    });
    await notifier.returnUpdated(accountOrder, 'APPROVED');
    await flush();

    expect(sent).toHaveLength(4);
    for (const s of sent) {
      expect(s.orderUrl).toBe('https://shop.example/account/orders/cmorder123');
    }
  });

  it('links guest orders to the confirmation page by id', async () => {
    const { notifier, sent } = setup();
    await notifier.orderStatusChanged(guestOrder, 'CANCELLED');
    await flush();
    expect(sent).toEqual([
      {
        to: 'alice@example.com',
        orderUrl:
          'https://shop.example/checkout/confirmation?orderId=cmguest456',
      },
    ]);
  });

  it('uses the id in the confirmation receipt too', async () => {
    const { notifier, sent } = setup();
    await notifier.orderConfirmed({
      ...accountOrder,
      currency: 'USD',
      subtotal: 1000,
      shippingTotal: 0,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: 1000,
      items: [],
    });
    await flush();
    expect(sent[0]?.orderUrl).toBe(
      'https://shop.example/account/orders/cmorder123',
    );
    expect(sent[0]?.orderUrl).not.toContain('ORD-');
  });
});
