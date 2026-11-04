import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './utils/e2e';
import { resetDb, makeUser, makeProduct, makeDeliveredOrder } from './utils/db';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * #9: each purchased unit can be returned once. Repeated or concurrent return
 * requests for the same line must not exceed the purchased quantity. Real DB,
 * so the order row lock is exercised for real.
 */
const PASSWORD = 'Str0ng!pass';

describe('Return request quantity cap (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function deliveredOrder() {
    const user = await makeUser(prisma, {
      email: 'returner@example.com',
      password: PASSWORD,
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const token = (login.body as { accessToken: string }).accessToken;
    const { product, variant } = await makeProduct(prisma, {
      title: 'Kettle',
      priceCents: 4000,
    });
    const order = await makeDeliveredOrder(prisma, {
      userId: user.id,
      email: user.email,
      variantId: variant.id,
      productTitle: product.title,
      sku: variant.sku,
      unitPriceCents: variant.price,
    });
    const item = await prisma.orderItem.findFirstOrThrow({
      where: { orderId: order.id },
    });
    const send = () =>
      request(app.getHttpServer())
        .post(`/orders/${order.id}/return`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          reasonCode: 'DEFECTIVE',
          items: [{ orderItemId: item.id, quantity: 1 }],
        });
    return { order, send };
  }

  it('rejects a repeat return for the only unit purchased', async () => {
    const { order, send } = await deliveredOrder();
    await send().expect(201);
    const res = await send().expect(400);
    expect(String((res.body as { message: unknown }).message)).toMatch(
      /already been returned|return pending/,
    );
    expect(
      await prisma.returnRequest.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });

  it('lets only one of two concurrent requests claim the unit', async () => {
    const { order, send } = await deliveredOrder();
    const [a, b] = await Promise.all([send(), send()]);
    expect([a.status, b.status].sort()).toEqual([201, 400]);
    expect(
      await prisma.returnRequest.count({ where: { orderId: order.id } }),
    ).toBe(1);
  });

  it('allows a new request once the earlier one is rejected', async () => {
    const { order, send } = await deliveredOrder();
    await send().expect(201);
    await prisma.returnRequest.updateMany({
      where: { orderId: order.id },
      data: { status: 'REJECTED' },
    });
    await send().expect(201);
  });
});
