import { ShowcaseService } from './showcase.service';

/**
 * The showcase reads (script 19) behind the homepage's TESTIMONIALS and
 * BRAND_STRIP blocks. Prisma is stubbed per test, so what is under test is the
 * filtering and ordering — which is where all the judgement lives.
 */

const review = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'r1',
  rating: 5,
  title: 'Excellent',
  body: 'A genuinely long enough review body to be worth quoting on the homepage.',
  createdAt: new Date('2026-01-01'),
  orderId: 'o1',
  user: { firstName: 'Ada', lastName: 'Lovelace' },
  product: { title: 'Widget', slug: 'widget', images: [{ url: 'u' }] },
  ...over,
});

const withReviews = (rows: unknown[]) =>
  new ShowcaseService({
    review: { findMany: () => Promise.resolve(rows) },
  } as never);

describe('ShowcaseService.listTestimonials', () => {
  it('drops reviews too short to be worth quoting', async () => {
    const service = withReviews([
      review({ id: 'long' }),
      review({ id: 'short', body: 'Great!' }),
      review({ id: 'empty', body: null }),
    ]);

    const result = await service.listTestimonials(6);

    expect(result.map((t) => t.id)).toEqual(['long']);
  });

  it('abbreviates the author and flags a purchase-backed review', async () => {
    const service = withReviews([review()]);

    const [first] = await service.listTestimonials(6);

    expect(first.author).toBe('Ada L.');
    expect(first.verified).toBe(true);
    expect(first.product.slug).toBe('widget');
  });

  it('marks a review with no order as unverified', async () => {
    const service = withReviews([review({ orderId: null })]);

    const [first] = await service.listTestimonials(6);

    expect(first.verified).toBe(false);
  });

  it('honours the requested count even though it over-fetches to filter', async () => {
    // Six qualifying rows come back; the caller asked for two.
    const service = withReviews(
      Array.from({ length: 6 }, (_, i) => review({ id: `r${i}` })),
    );

    const result = await service.listTestimonials(2);

    expect(result).toHaveLength(2);
  });

  it('falls back to the first name when there is no surname initial', async () => {
    const service = withReviews([
      review({ user: { firstName: 'Prince', lastName: '' } }),
    ]);

    const [first] = await service.listTestimonials(6);

    expect(first.author).toBe('Prince');
  });
});

describe('ShowcaseService.listBrands', () => {
  const brand = (name: string, count: number) => ({
    id: name,
    name,
    slug: name.toLowerCase(),
    logoUrl: null,
    _count: { products: count },
  });

  const withBrands = (rows: unknown[]) =>
    new ShowcaseService({
      brand: { findMany: () => Promise.resolve(rows) },
    } as never);

  it('orders by how much of the brand the store actually stocks', async () => {
    const service = withBrands([brand('Orbit', 2), brand('Kryon', 9)]);

    const result = await service.listBrands(12);

    expect(result.map((b) => b.name)).toEqual(['Kryon', 'Orbit']);
    expect(result[0].productCount).toBe(9);
  });

  it('breaks a tie alphabetically rather than by insertion order', async () => {
    const service = withBrands([brand('Zeta', 3), brand('Alpha', 3)]);

    const result = await service.listBrands(12);

    expect(result.map((b) => b.name)).toEqual(['Alpha', 'Zeta']);
  });

  it('caps the strip at the requested length', async () => {
    const service = withBrands([brand('A', 5), brand('B', 4), brand('C', 3)]);

    expect(await service.listBrands(2)).toHaveLength(2);
  });
});
