import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { WISHLIST_MAX, WishlistService } from './wishlist.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { ProductService } from '../product/product.service';
import type { CartService } from '../cart/cart.service';

/**
 * #36: the wishlist must only take ACTIVE products (a DRAFT/ARCHIVED one was
 * stored but never shown, and move-to-cart put it in the cart), and it needs a
 * size cap.
 */
function setup(opts: {
  status?: ProductStatus | null;
  count?: number;
  existing?: boolean;
}) {
  const prisma = {
    product: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          opts.status === null
            ? null
            : { id: 'p1', status: opts.status ?? ProductStatus.ACTIVE },
        ),
      ),
    },
    wishlistItem: {
      findMany: jest.fn(() => Promise.resolve([])),
      findUnique: jest.fn(() =>
        Promise.resolve(opts.existing ? { productId: 'p1' } : null),
      ),
      count: jest.fn(() => Promise.resolve(opts.count ?? 0)),
      upsert: jest.fn(() => Promise.resolve({})),
      delete: jest.fn(() => Promise.resolve({})),
    },
    productVariant: {
      findFirst: jest.fn(() => Promise.resolve({ id: 'v1' })),
    },
  };
  const products = { getCardsByIds: jest.fn(() => Promise.resolve([])) };
  const cart = {
    getOrCreateUserCart: jest.fn(() => Promise.resolve({ id: 'c1' })),
    addItem: jest.fn(() => Promise.resolve({ items: [] })),
  };
  const service = new WishlistService(
    prisma as unknown as PrismaService,
    products as unknown as ProductService,
    cart as unknown as CartService,
  );
  return { service, prisma, cart };
}

describe('WishlistService', () => {
  describe('add', () => {
    it('adds an ACTIVE product', async () => {
      const { service, prisma } = setup({});
      await service.add(1, 'p1');
      expect(prisma.wishlistItem.upsert).toHaveBeenCalled();
    });

    it.each([ProductStatus.DRAFT, ProductStatus.ARCHIVED])(
      'rejects a %s product with 404 and stores nothing',
      async (status) => {
        const { service, prisma } = setup({ status });
        await expect(service.add(1, 'p1')).rejects.toBeInstanceOf(
          NotFoundException,
        );
        expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
      },
    );

    it('rejects a new item once the wishlist is full', async () => {
      const { service, prisma } = setup({ count: WISHLIST_MAX });
      await expect(service.add(1, 'p1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled();
    });

    it('still accepts re-adding an item already in a full wishlist', async () => {
      const { service, prisma } = setup({
        count: WISHLIST_MAX,
        existing: true,
      });
      await service.add(1, 'p1');
      expect(prisma.wishlistItem.upsert).toHaveBeenCalled();
    });
  });

  describe('moveToCart', () => {
    it('moves an ACTIVE product into the cart', async () => {
      const { service, cart } = setup({ existing: true });
      await expect(service.moveToCart(1, 'p1')).resolves.toMatchObject({
        moved: true,
      });
      expect(cart.addItem).toHaveBeenCalledWith('c1', 'v1', 1);
    });

    it.each([ProductStatus.DRAFT, ProductStatus.ARCHIVED])(
      'refuses to move a %s product into the cart',
      async (status) => {
        const { service, cart } = setup({ status, existing: true });
        await expect(service.moveToCart(1, 'p1')).rejects.toBeInstanceOf(
          BadRequestException,
        );
        expect(cart.addItem).not.toHaveBeenCalled();
      },
    );
  });

  it('lists at most WISHLIST_MAX rows', async () => {
    const { service, prisma } = setup({});
    await service.list(1);
    expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: WISHLIST_MAX }),
    );
  });
});
