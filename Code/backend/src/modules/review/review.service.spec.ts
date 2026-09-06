import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ReviewStatus } from '@prisma/client';
import { ReviewService } from './review.service';

/**
 * The review engine's rules (script 13, FR-701..705): the verified-purchase gate,
 * the one-per-user constraint, the photo cap, helpful-vote idempotency, the
 * public star distribution, and the ×100 aggregate recompute. We build the
 * service with a minimal stubbed Prisma tailored per test; Audit + Mail are dummies.
 */
const noAudit = { record: () => Promise.resolve() } as never;
const noMail = { newReview: () => undefined } as never;

describe('ReviewService.create — verified-purchase gate (FR-701)', () => {
  const baseProduct = { id: 'p1', title: 'Widget' };

  it('rejects a non-purchaser with 403', async () => {
    const service = new ReviewService(
      {
        product: { findUnique: () => Promise.resolve(baseProduct) },
        order: { findFirst: () => Promise.resolve(null) }, // no delivered order
      } as never,
      noAudit,
      noMail,
    );
    await expect(
      service.create(7, { productId: 'p1', rating: 5 }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a duplicate review with 409', async () => {
    const service = new ReviewService(
      {
        product: { findUnique: () => Promise.resolve(baseProduct) },
        order: { findFirst: () => Promise.resolve({ id: 'o1' }) },
        review: { findUnique: () => Promise.resolve({ id: 'existing' }) },
      } as never,
      noAudit,
      noMail,
    );
    await expect(
      service.create(7, { productId: 'p1', rating: 4 }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects more than 3 photos', async () => {
    const service = new ReviewService(
      {
        product: { findUnique: () => Promise.resolve(baseProduct) },
        order: { findFirst: () => Promise.resolve({ id: 'o1' }) },
        review: { findUnique: () => Promise.resolve(null) },
        mediaAsset: { findMany: () => Promise.resolve([]) },
      } as never,
      noAudit,
      noMail,
    );
    await expect(
      service.create(7, {
        productId: 'p1',
        rating: 5,
        mediaIds: ['a', 'b', 'c', 'd'],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unknown media ids', async () => {
    const service = new ReviewService(
      {
        product: { findUnique: () => Promise.resolve(baseProduct) },
        order: { findFirst: () => Promise.resolve({ id: 'o1' }) },
        review: { findUnique: () => Promise.resolve(null) },
        mediaAsset: { findMany: () => Promise.resolve([]) }, // 0 of 2 resolved
      } as never,
      noAudit,
      noMail,
    );
    await expect(
      service.create(7, { productId: 'p1', rating: 5, mediaIds: ['a', 'b'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ReviewService.voteHelpful (FR-704)', () => {
  it('rejects voting on a non-approved review', async () => {
    const service = new ReviewService(
      {
        review: {
          findUnique: () =>
            Promise.resolve({ id: 'r1', status: ReviewStatus.PENDING, helpfulCount: 0 }),
        },
      } as never,
      noAudit,
      noMail,
    );
    await expect(service.voteHelpful('r1', 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('is idempotent — a repeat vote does not increment', async () => {
    let txCalled = false;
    const service = new ReviewService(
      {
        review: {
          findUnique: () =>
            Promise.resolve({ id: 'r1', status: ReviewStatus.APPROVED, helpfulCount: 4 }),
        },
        reviewVote: { findUnique: () => Promise.resolve({ id: 'v1' }) },
        $transaction: () => {
          txCalled = true;
          return Promise.resolve();
        },
      } as never,
      noAudit,
      noMail,
    );
    const res = await service.voteHelpful('r1', 7);
    expect(res).toEqual({ reviewId: 'r1', helpfulCount: 4, voted: true });
    expect(txCalled).toBe(false); // no write path taken
  });

  it('increments on a first-time vote', async () => {
    const service = new ReviewService(
      {
        review: {
          findUnique: () =>
            Promise.resolve({ id: 'r1', status: ReviewStatus.APPROVED, helpfulCount: 4 }),
        },
        reviewVote: { findUnique: () => Promise.resolve(null) },
        $transaction: (fn: (tx: unknown) => unknown) =>
          Promise.resolve(
            fn({
              reviewVote: { create: () => Promise.resolve({}) },
              review: { update: () => Promise.resolve({ helpfulCount: 5 }) },
            }),
          ),
      } as never,
      noAudit,
      noMail,
    );
    const res = await service.voteHelpful('r1', 7);
    expect(res.helpfulCount).toBe(5);
    expect(res.voted).toBe(true);
  });
});

describe('ReviewService.listPublic — distribution + aggregate (FR-705)', () => {
  it('fills all five star buckets and exposes the ×100 average as a float', async () => {
    const service = new ReviewService(
      {
        // Array-form $transaction eagerly calls these builders, then resolves the
        // rows we hand it; groupBy is awaited separately.
        review: {
          findMany: () => undefined,
          count: () => undefined,
          groupBy: () => Promise.resolve([{ rating: 5, _count: { rating: 1 } }]),
        },
        product: { findUnique: () => undefined },
        $transaction: () =>
          Promise.resolve([
            [
              {
                id: 'r1',
                rating: 5,
                title: 'Great',
                body: 'Loved it',
                helpfulCount: 2,
                createdAt: new Date('2026-01-01'),
                images: [],
                user: { firstName: 'Ada', lastName: 'Lovelace' },
              },
            ],
            1, // total
            { ratingAverage: 450, ratingCount: 1 }, // product aggregate ×100
          ]),
        reviewVote: { findMany: () => Promise.resolve([]) },
      } as never,
      noAudit,
      noMail,
    );

    const res = await service.listPublic({ productId: 'p1' }, null);
    expect(res.aggregate).toEqual({ average: 4.5, count: 1 });
    expect(res.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 1 });
    expect(res.items[0].author).toBe('Ada L.'); // privacy-preserving display name
    expect(res.items[0].votedByMe).toBe(false);
  });

  it('reports a null average when there are no approved reviews', async () => {
    const service = new ReviewService(
      {
        review: {
          findMany: () => undefined,
          count: () => undefined,
          groupBy: () => Promise.resolve([]),
        },
        product: { findUnique: () => undefined },
        $transaction: () =>
          Promise.resolve([[], 0, { ratingAverage: 0, ratingCount: 0 }]),
        reviewVote: { findMany: () => Promise.resolve([]) },
      } as never,
      noAudit,
      noMail,
    );
    const res = await service.listPublic({ productId: 'p1' }, null);
    expect(res.aggregate).toEqual({ average: null, count: 0 });
    expect(res.distribution).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 });
  });
});

describe('ReviewService.approve — recomputes aggregate ×100 (FR-703)', () => {
  it('writes the rounded ×100 average and approved count to the product', async () => {
    const productUpdates: { ratingAverage: number; ratingCount: number }[] = [];
    const tx = {
      review: {
        update: () => Promise.resolve({ id: 'r1', status: ReviewStatus.APPROVED }),
        aggregate: () =>
          Promise.resolve({ _avg: { rating: 4.5 }, _count: { rating: 2 } }),
      },
      product: {
        update: (args: { data: { ratingAverage: number; ratingCount: number } }) => {
          productUpdates.push(args.data);
          return Promise.resolve({});
        },
      },
    };
    const service = new ReviewService(
      {
        review: {
          findUnique: () => Promise.resolve({ id: 'r1', productId: 'p1', status: 'PENDING' }),
        },
        $transaction: (fn: (t: unknown) => unknown) => Promise.resolve(fn(tx)),
      } as never,
      noAudit,
      noMail,
    );

    await service.approve('r1', 99);
    expect(productUpdates).toEqual([{ ratingAverage: 450, ratingCount: 2 }]);
  });
});
