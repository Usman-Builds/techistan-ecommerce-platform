import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { CLOUDINARY } from '../src/modules/media/cloudinary.provider';
import { resetDb, makeUser, makeProduct, makeDeliveredOrder } from './utils/db';

/**
 * #33: customers can upload review photos. The customer endpoints sign uploads
 * into the reviews folder only, verify the asset with Cloudinary like the admin
 * flow, and record the uploader; a review can only attach the author's own
 * uploads. The admin media library stays admin-only. Cloudinary is stubbed.
 */
const PASSWORD = 'Str0ng!pass';
const REVIEWS = 'techistan/reviews';

describe('Customer review photo upload (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const saved = { ...process.env };
  let logins = 0;

  beforeAll(async () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.CLOUDINARY_API_KEY = 'key';
    process.env.CLOUDINARY_API_SECRET = 'secret';
    // Give each login its own throttle bucket (the strict auth limit is per
    // client IP), so this suite's logins don't trip each other's 429.
    process.env.PROXY_SECRET = 'test-proxy-secret';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .overrideProvider(CLOUDINARY)
      .useValue({
        utils: { api_sign_request: () => 'signed' },
        api: {
          resource: (publicId: string) =>
            Promise.resolve({
              format: 'jpg',
              width: 800,
              height: 600,
              bytes: 12345,
              secure_url: `https://res.cloudinary.com/demo/image/upload/${publicId}.jpg`,
            }),
        },
        uploader: { destroy: () => Promise.resolve({ result: 'ok' }) },
      })
      .compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.use(cookieParser('test'));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    prisma = app.get(PrismaService);
  });
  afterAll(async () => {
    await app.close();
    process.env = saved;
  });
  beforeEach(async () => {
    await resetDb(prisma);
  });

  async function customer(email: string) {
    const user = await makeUser(prisma, { email, password: PASSWORD });
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .set('x-proxy-secret', 'test-proxy-secret')
      .set('x-client-ip', `198.51.100.${++logins}`)
      .send({ email, password: PASSWORD })
      .expect(200);
    return { user, token: (res.body as { accessToken: string }).accessToken };
  }
  const post = (path: string, token: string | null, body: object = {}) => {
    const req = request(app.getHttpServer()).post(path);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };
  const upload = (token: string, name: string) =>
    post('/reviews/media', token, {
      cloudinaryPublicId: `${REVIEWS}/${name}`,
      url: `https://res.cloudinary.com/demo/image/upload/${REVIEWS}/${name}.jpg`,
    });

  it('signs a customer upload into the reviews folder only', async () => {
    const { token } = await customer('alice@example.com');
    const res = await post('/reviews/media/upload-signature', token).expect(
      200,
    );
    expect(res.body).toMatchObject({
      signature: 'signed',
      folder: REVIEWS,
      cloudName: 'demo',
    });
    expect(JSON.stringify(res.body)).not.toContain('secret');
    // Asking for another folder still signs the reviews folder.
    const other = await post('/reviews/media/upload-signature', token, {
      folder: 'techistan/products',
    }).expect(200);
    expect((other.body as { folder: string }).folder).toBe(REVIEWS);
  });

  it('records a verified upload against the customer', async () => {
    const { user, token } = await customer('alice@example.com');
    const res = await upload(token, 'abc123').expect(201);
    const asset = await prisma.mediaAsset.findUniqueOrThrow({
      where: { id: (res.body as { id: string }).id },
    });
    expect(asset).toMatchObject({
      uploadedById: user.id,
      folder: REVIEWS,
      format: 'jpg',
    });
  });

  it('refuses assets outside the reviews folder', async () => {
    const { token } = await customer('alice@example.com');
    await post('/reviews/media', token, {
      cloudinaryPublicId: 'techistan/products/hero',
      url: 'https://res.cloudinary.com/demo/image/upload/techistan/products/hero.jpg',
    }).expect(400);
  });

  it('refuses to take over another customer’s upload', async () => {
    const alice = await customer('alice@example.com');
    const bob = await customer('bob@example.com');
    await upload(alice.token, 'shared').expect(201);
    await upload(bob.token, 'shared').expect(403);
  });

  it('requires a session, and keeps the admin library admin-only', async () => {
    await post('/reviews/media/upload-signature', null).expect(401);
    await post('/reviews/media', null, {}).expect(401);
    const { token } = await customer('alice@example.com');
    await post('/media/upload-signature', token).expect(403);
  });

  it('attaches the author’s own uploads to a review, and nobody else’s', async () => {
    const alice = await customer('alice@example.com');
    const bob = await customer('bob@example.com');
    const { product, variant } = await makeProduct(prisma, { title: 'Lamp' });
    await makeDeliveredOrder(prisma, {
      userId: alice.user.id,
      email: alice.user.email,
      variantId: variant.id,
      productTitle: product.title,
      sku: variant.sku,
      unitPriceCents: variant.price,
    });
    const own = (await upload(alice.token, 'mine').expect(201)).body as {
      id: string;
    };
    const foreign = (await upload(bob.token, 'theirs').expect(201)).body as {
      id: string;
    };
    const review = {
      productId: product.id,
      rating: 5,
      body: 'Bright and sturdy',
    };

    await post('/reviews', alice.token, {
      ...review,
      mediaIds: [foreign.id],
    }).expect(400);

    const res = await post('/reviews', alice.token, {
      ...review,
      mediaIds: [own.id],
    }).expect(201);
    const images = await prisma.reviewImage.findMany({
      where: { reviewId: (res.body as { id: string }).id },
    });
    expect(images.map((i) => i.cloudinaryPublicId)).toEqual([
      `${REVIEWS}/mine`,
    ]);
  });
});
