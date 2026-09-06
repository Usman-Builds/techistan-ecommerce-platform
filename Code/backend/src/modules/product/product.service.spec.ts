import { BadRequestException } from '@nestjs/common';
import { ProductService } from './product.service';
import { VariantInputDto } from './dto/variant.dto';

/**
 * `validateVariantMatrix` is pure (touches no injected dependency), so we build
 * the service with dummy deps and exercise the rules directly (Task 5).
 */
describe('ProductService.validateVariantMatrix', () => {
  const service = new ProductService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const v = (options: Record<string, string>, price = 1000): VariantInputDto =>
    ({ price, options }) as VariantInputDto;

  it('accepts an empty variant list (draft)', () => {
    expect(service.validateVariantMatrix(undefined, [])).toEqual({ axes: [] });
  });

  it('infers axes from variant option keys when not declared', () => {
    const result = service.validateVariantMatrix(undefined, [
      v({ Size: 'S', Color: 'Red' }),
      v({ Size: 'M', Color: 'Red' }),
    ]);
    expect(result.axes).toEqual(['Size', 'Color']);
  });

  it('accepts a valid 2-axis matrix', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size', 'Color'],
        [
          v({ Size: 'S', Color: 'Red' }),
          v({ Size: 'S', Color: 'Blue' }),
          v({ Size: 'M', Color: 'Red' }),
          v({ Size: 'M', Color: 'Blue' }),
        ],
      ),
    ).not.toThrow();
  });

  it('rejects more than 3 axes', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size', 'Color', 'Material', 'Fit'],
        [v({ Size: 'S', Color: 'Red', Material: 'Cotton', Fit: 'Slim' })],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects more than 100 combinations', () => {
    const variants: VariantInputDto[] = [];
    for (let i = 0; i < 101; i += 1) {
      variants.push(v({ Size: `S${i}` }));
    }
    expect(() =>
      service.validateVariantMatrix(['Size'], variants),
    ).toThrow(/at most 100 variants/);
  });

  it('rejects an unknown axis in a variant', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size'],
        [v({ Size: 'S', Color: 'Red' })],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects a missing axis in a variant', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size', 'Color'],
        [v({ Size: 'S' })],
      ),
    ).toThrow(BadRequestException);
  });

  it('rejects an empty option value', () => {
    expect(() =>
      service.validateVariantMatrix(['Size'], [v({ Size: '  ' })]),
    ).toThrow(BadRequestException);
  });

  it('rejects duplicate combinations', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size', 'Color'],
        [
          v({ Size: 'S', Color: 'Red' }),
          v({ Size: 'S', Color: 'Red' }),
        ],
      ),
    ).toThrow(/Duplicate variant combination/);
  });

  it('rejects duplicate axis names', () => {
    expect(() =>
      service.validateVariantMatrix(
        ['Size', 'Size'],
        [v({ Size: 'S' })],
      ),
    ).toThrow(BadRequestException);
  });
});

/**
 * `resolveCategoryScope` is private but is the whole reason a branch category
 * page shows anything at all, so it is exercised through a bracket-access cast
 * rather than left untested. Only `prisma.category.findMany` is touched, so a
 * one-method stub is enough.
 */
describe('ProductService category scoping', () => {
  // computers > laptops > ultrabooks, plus an unrelated audio branch.
  const CATEGORIES = [
    { id: 'c_computers', slug: 'computers', parentId: null },
    { id: 'c_laptops', slug: 'laptops', parentId: 'c_computers' },
    { id: 'c_ultrabooks', slug: 'ultrabooks', parentId: 'c_laptops' },
    { id: 'c_desktops', slug: 'desktops', parentId: 'c_computers' },
    { id: 'c_audio', slug: 'audio', parentId: null },
  ];

  const prisma = {
    category: { findMany: jest.fn().mockResolvedValue(CATEGORIES) },
  };

  const service = new ProductService(
    prisma as never,
    {} as never,
    {} as never,
    {} as never,
  );

  const scope = (slug?: string): Promise<string[] | undefined> =>
    (
      service as unknown as {
        resolveCategoryScope: (s?: string) => Promise<string[] | undefined>;
      }
    ).resolveCategoryScope(slug);

  it('returns undefined when no category is requested (no filter)', async () => {
    await expect(scope(undefined)).resolves.toBeUndefined();
  });

  it('includes the whole subtree for a branch category', async () => {
    const ids = await scope('computers');
    expect(ids).toEqual(
      expect.arrayContaining([
        'c_computers',
        'c_laptops',
        'c_ultrabooks',
        'c_desktops',
      ]),
    );
    expect(ids).toHaveLength(4);
  });

  it('walks more than one level down', async () => {
    await expect(scope('laptops')).resolves.toEqual(
      expect.arrayContaining(['c_laptops', 'c_ultrabooks']),
    );
  });

  it('returns just the category itself for a leaf', async () => {
    await expect(scope('ultrabooks')).resolves.toEqual(['c_ultrabooks']);
  });

  it('does not leak across sibling branches', async () => {
    await expect(scope('audio')).resolves.toEqual(['c_audio']);
  });

  it('returns an empty scope for an unknown slug, not a dropped filter', async () => {
    // An empty array becomes `categoryId: { in: [] }` -> zero rows. Returning
    // undefined here would silently widen the query to the entire catalog.
    await expect(scope('no-such-category')).resolves.toEqual([]);
  });
});
