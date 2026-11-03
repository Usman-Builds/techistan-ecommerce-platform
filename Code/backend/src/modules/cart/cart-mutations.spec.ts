import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { CartService } from './cart.service';

/**
 * Cart mutations (script 09, FR-302/304, #47): the add guards, absolute
 * quantity updates clamped to stock (0 removes the line), removal scoped to the
 * cart, and coupon apply passing the cart's lines to validation. The read-back
 * (`buildView`) and the abandonment clock (`touch`) are stubbed: they're not
 * what is under test here.
 */
function setup(
  opts: {
    variant?: {
      stock: number;
      status?: ProductStatus;
    } | null;
    item?: { stock: number; price: number } | null;
  } = {},
) {
  const prisma = {
    productVariant: {
      findUnique: jest.fn(() =>
        Promise.resolve(
          opts.variant === null
            ? null
            : {
                id: 'v1',
                price: 2500,
                stock: opts.variant?.stock ?? 10,
                productId: 'p1',
                product: {
                  status: opts.variant?.status ?? ProductStatus.ACTIVE,
                },
              },
        ),
      ),
    },
    cartItem: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          opts.item === null
            ? null
            : {
                id: 'i1',
                cartId: 'c1',
                quantity: 1,
                variant: {
                  stock: opts.item?.stock ?? 10,
                  price: opts.item?.price ?? 2500,
                },
              },
        ),
      ),
      update: jest.fn(() => Promise.resolve({})),
      delete: jest.fn(() => Promise.resolve({})),
      deleteMany: jest.fn(() => Promise.resolve({ count: 1 })),
      upsert: jest.fn(() => Promise.resolve({})),
      updateMany: jest.fn(() => Promise.resolve({ count: 0 })),
    },
    cart: {
      findUnique: jest.fn(() => Promise.resolve({ userId: 9 })),
      update: jest.fn(() => Promise.resolve({})),
    },
  };
  const coupon = {
    validate: jest.fn(() => Promise.resolve({ code: 'SAVE10' })),
  };
  const service = new CartService(prisma as never, coupon as never);
  const internals = service as unknown as {
    touch(cartId: string): Promise<void>;
    mustLoad(cartId: string): Promise<unknown>;
    computeLines(cart: unknown): unknown;
  };
  jest.spyOn(service, 'buildView').mockResolvedValue({ id: 'c1' } as never);
  const touch = jest.spyOn(internals, 'touch').mockResolvedValue(undefined);
  return { service, prisma, coupon, internals, touch };
}

describe('CartService mutations (#47)', () => {
  describe('addItem guards', () => {
    it('404s for an unknown variant', async () => {
      const { service, prisma } = setup({ variant: null });
      await expect(service.addItem('c1', 'nope', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('400s for an out-of-stock variant', async () => {
      const { service, prisma } = setup({ variant: { stock: 0 } });
      await expect(service.addItem('c1', 'v1', 1)).rejects.toThrow(
        /out of stock/,
      );
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });

    it('400s for a product that is not ACTIVE', async () => {
      const { service, prisma } = setup({
        variant: { stock: 5, status: ProductStatus.DRAFT },
      });
      await expect(service.addItem('c1', 'v1', 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    it('sets the quantity and refreshes the unit price', async () => {
      const { service, prisma, touch } = setup({
        item: { stock: 10, price: 1999 },
      });
      await service.updateItem('c1', 'i1', 4);
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { quantity: 4, unitPriceCents: 1999 },
      });
      expect(touch).toHaveBeenCalledWith('c1');
    });

    it('clamps the quantity to the stock on hand', async () => {
      const { service, prisma } = setup({ item: { stock: 3, price: 2500 } });
      await service.updateItem('c1', 'i1', 8);
      expect(prisma.cartItem.update).toHaveBeenCalledWith({
        where: { id: 'i1' },
        data: { quantity: 3, unitPriceCents: 2500 },
      });
    });

    it('removes the line for quantity 0', async () => {
      const { service, prisma } = setup();
      await service.updateItem('c1', 'i1', 0);
      expect(prisma.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'i1' },
      });
      expect(prisma.cartItem.update).not.toHaveBeenCalled();
    });

    it('removes the line when its variant sold out', async () => {
      const { service, prisma } = setup({ item: { stock: 0, price: 2500 } });
      await service.updateItem('c1', 'i1', 2);
      expect(prisma.cartItem.delete).toHaveBeenCalled();
    });

    it('only touches lines of the caller’s cart', async () => {
      const { service, prisma } = setup({ item: null });
      await expect(service.updateItem('c1', 'other', 1)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.cartItem.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'other', cartId: 'c1' } }),
      );
    });
  });

  it('removeItem 404s for a line outside the cart', async () => {
    const { service, prisma } = setup();
    prisma.cartItem.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.removeItem('c1', 'other')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.cartItem.deleteMany).toHaveBeenCalledWith({
      where: { id: 'other', cartId: 'c1' },
    });
  });

  describe('applyCoupon', () => {
    const lines = [
      {
        productId: 'p1',
        categoryId: 'cat1',
        quantity: 2,
        lineTotalCents: 5000,
        onSale: false,
      },
    ];

    it('validates against the cart subtotal AND its lines, then stores the code', async () => {
      const { service, prisma, coupon, internals } = setup();
      jest.spyOn(internals, 'mustLoad').mockResolvedValue({});
      jest
        .spyOn(internals, 'computeLines')
        .mockReturnValue({ subtotal: 5000, promotionLines: lines });

      await service.applyCoupon('c1', 'save10');

      expect(coupon.validate).toHaveBeenCalledWith('save10', {
        subtotalCents: 5000,
        userId: 9,
        lines,
      });
      expect(prisma.cart.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: expect.objectContaining({ couponCode: 'SAVE10' }) as unknown,
      });
    });

    it('stores nothing when validation rejects the code', async () => {
      const { service, prisma, coupon, internals } = setup();
      jest.spyOn(internals, 'mustLoad').mockResolvedValue({});
      jest
        .spyOn(internals, 'computeLines')
        .mockReturnValue({ subtotal: 5000, promotionLines: lines });
      coupon.validate.mockRejectedValue(
        new BadRequestException('This coupon has expired.'),
      );

      await expect(service.applyCoupon('c1', 'OLD')).rejects.toThrow('expired');
      expect(prisma.cart.update).not.toHaveBeenCalled();
    });
  });
});
