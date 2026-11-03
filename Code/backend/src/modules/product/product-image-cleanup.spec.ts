import { ProductService } from './product.service';

/**
 * #28: deleting a product must destroy a Cloudinary asset only when nothing
 * else still uses that public_id: a duplicated product shares its source's
 * images, and library assets can be picked for several products.
 */
function setup(stillReferenced: {
  productImages?: string[];
  mediaAssets?: string[];
  reviewImages?: string[];
}) {
  const rows = (ids: string[] = []) =>
    ids.map((cloudinaryPublicId) => ({ cloudinaryPublicId }));
  const tx = {
    product: { delete: jest.fn(() => Promise.resolve({})) },
  };
  const prisma = {
    product: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'copy',
          images: [
            { cloudinaryPublicId: 'products/shared' },
            { cloudinaryPublicId: 'products/library' },
            { cloudinaryPublicId: 'products/only-mine' },
          ],
        }),
      ),
    },
    productImage: {
      findMany: jest.fn(() =>
        Promise.resolve(rows(stillReferenced.productImages)),
      ),
    },
    mediaAsset: {
      findMany: jest.fn(() =>
        Promise.resolve(rows(stillReferenced.mediaAssets)),
      ),
    },
    reviewImage: {
      findMany: jest.fn(() =>
        Promise.resolve(rows(stillReferenced.reviewImages)),
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const media = {
    cleanupCloudinaryAsset: jest.fn(() => Promise.resolve(true)),
  };
  const audit = { record: jest.fn(() => Promise.resolve(undefined)) };
  const search = { removeProduct: jest.fn(() => Promise.resolve(undefined)) };
  const service = new ProductService(
    prisma as never,
    media as never,
    audit as never,
    search as never,
  );
  return { service, media, prisma };
}

const destroyed = (media: { cleanupCloudinaryAsset: jest.Mock }) =>
  media.cleanupCloudinaryAsset.mock.calls.map((c: unknown[]) => c[0]).sort();

describe('ProductService.remove image cleanup', () => {
  it('destroys every image when nothing else references them', async () => {
    const { service, media } = setup({});
    await service.remove('copy');
    expect(destroyed(media)).toEqual([
      'products/library',
      'products/only-mine',
      'products/shared',
    ]);
  });

  it('keeps assets still used by another product, the library or a review', async () => {
    const { service, media } = setup({
      productImages: ['products/shared'],
      mediaAssets: ['products/library'],
    });
    await service.remove('copy');
    expect(destroyed(media)).toEqual(['products/only-mine']);
  });

  it('keeps an asset referenced by a review photo', async () => {
    const { service, media } = setup({ reviewImages: ['products/only-mine'] });
    await service.remove('copy');
    expect(destroyed(media)).toEqual(['products/library', 'products/shared']);
  });

  it('checks references after the product row is gone', async () => {
    const { service, prisma } = setup({});
    await service.remove('copy');
    expect(prisma.productImage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          cloudinaryPublicId: {
            in: expect.arrayContaining(['products/shared']),
          },
        },
      }),
    );
    expect(prisma.$transaction.mock.invocationCallOrder[0]).toBeLessThan(
      prisma.productImage.findMany.mock.invocationCallOrder[0],
    );
  });
});
