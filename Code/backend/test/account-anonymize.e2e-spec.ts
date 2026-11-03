import { INestApplication } from '@nestjs/common';
import { OrderStatus, Prisma, UserStatus } from '@prisma/client';
import { createTestApp } from './utils/e2e';
import { makeUser, resetDb } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';
import { AccountService } from '../src/modules/account/account.service';

/**
 * #25: GDPR anonymisation keeps orders for financial records but must strip
 * the customer's personal data from them: the order email, name, phone and
 * street address (keeping only the country/state tax needs), and the free-text
 * note on return requests.
 */
const ADDRESS = {
  fullName: 'Jane Buyer',
  phone: '+1 555 0100',
  line1: '1 Market St',
  line2: 'Apt 4',
  city: 'Springfield',
  state: 'CA',
  postalCode: '90001',
  country: 'US',
};

describe('Account anonymisation scrubs retained orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });

  async function seed(email: string, userId: number | null, n: number) {
    return prisma.order.create({
      data: {
        orderNumber: `ORD-TEST-${n}`,
        userId,
        email,
        status: OrderStatus.DELIVERED,
        subtotal: 1000,
        grandTotal: 1000,
        shippingAddress: ADDRESS as unknown as Prisma.InputJsonValue,
        billingAddress: ADDRESS as unknown as Prisma.InputJsonValue,
        returnRequests: {
          create: { reasonCode: 'DAMAGED', note: 'Call me on 555 0100' },
        },
      },
    });
  }

  it('anonymises the order email, addresses and return notes', async () => {
    await resetDb(prisma);
    const user = await makeUser(prisma, {
      email: 'jane@example.com',
      password: 'Str0ng!pass',
    });
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: UserStatus.PENDING_DELETION,
        deletionScheduledAt: new Date(Date.now() - 1000),
      },
    });
    const mine = await seed('jane@example.com', user.id, 1);
    // A guest order that happens to use the same email is someone else's
    // record (not linked to this account) and is left alone.
    const guest = await seed('jane@example.com', null, 2);

    await expect(app.get(AccountService).anonymizeExpired()).resolves.toBe(1);

    const order = await prisma.order.findUniqueOrThrow({
      where: { id: mine.id },
      include: { returnRequests: true },
    });
    expect(order.email).toBe(`deleted+${user.id}@deleted.invalid`);
    for (const addr of [order.shippingAddress, order.billingAddress]) {
      const json = JSON.stringify(addr);
      for (const pii of ['Jane', '555', 'Market', 'Apt 4', 'Springfield']) {
        expect(json).not.toContain(pii);
      }
      // Tax jurisdiction is kept for the financial record.
      expect(addr).toMatchObject({ country: 'US', state: 'CA' });
    }
    expect(order.returnRequests[0].note).toBeNull();
    // Financial data is untouched.
    expect(order.grandTotal).toBe(1000);

    // Admin search by the original email no longer finds the person.
    const found = await prisma.order.count({
      where: { userId: user.id, email: 'jane@example.com' },
    });
    expect(found).toBe(0);

    const other = await prisma.order.findUniqueOrThrow({
      where: { id: guest.id },
      include: { returnRequests: true },
    });
    expect(other.email).toBe('jane@example.com');
    expect(other.returnRequests[0].note).toBe('Call me on 555 0100');
  });
});
