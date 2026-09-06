import { CartService } from './cart.service';

/**
 * Guest → user cart merge on login (script 09, FR-304). The merge is DB-coupled,
 * so we drive it through a small stateful PrismaService stub and assert the three
 * behaviors that matter: quantity coalescing, stock clamping, and variant de-dup.
 */

type Variant = { id: string; stock: number; price: number };
type GuestItem = {
  id: string;
  variantId: string;
  productId: string;
  quantity: number;
};

function makePrisma(opts: {
  guest: { id: string; items: GuestItem[] } | null;
  userCart: { id: string } | null;
  variants: Variant[];
  existing: Record<string, number>; // variantId -> existing qty in the user cart
}) {
  const upserts: { variantId: string; quantity: number }[] = [];
  const deletedCarts: string[] = [];

  const prisma = {
    cart: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        if (where.sessionId !== undefined) {
          return Promise.resolve(opts.guest);
        }
        if (where.userId !== undefined) {
          return Promise.resolve(opts.userCart);
        }
        return Promise.resolve(null);
      }),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockImplementation(({ where }: any) => {
        deletedCarts.push(where.id);
        return Promise.resolve({});
      }),
    },
    productVariant: {
      findMany: jest.fn().mockResolvedValue(opts.variants),
    },
    cartItem: {
      findUnique: jest.fn().mockImplementation(({ where }: any) => {
        const variantId = where.cartId_variantId.variantId;
        const qty = opts.existing[variantId];
        return Promise.resolve(qty != null ? { quantity: qty } : null);
      }),
      upsert: jest.fn().mockImplementation(({ update }: any) => {
        // Recover which variant this was from the create branch of the call.
        return Promise.resolve(update);
      }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };

  // Capture upsert variant+qty from its args (create carries variantId).
  prisma.cartItem.upsert.mockImplementation(({ create }: any) => {
    upserts.push({ variantId: create.variantId, quantity: create.quantity });
    return Promise.resolve({});
  });

  return { prisma, upserts, deletedCarts };
}

function service(prisma: unknown) {
  return new CartService(prisma as never, {} as never);
}

describe('CartService.mergeGuestCartIntoUser', () => {
  it('is a no-op (and cleans up) when the guest cart is empty', async () => {
    const { prisma, deletedCarts } = makePrisma({
      guest: { id: 'g1', items: [] },
      userCart: { id: 'u1' },
      variants: [],
      existing: {},
    });
    await service(prisma).mergeGuestCartIntoUser('sess', 42);
    expect(deletedCarts).toContain('g1'); // empty guest cart discarded
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });

  it('coalesces quantities, clamps to stock, and de-dups per variant', async () => {
    const { prisma, upserts, deletedCarts } = makePrisma({
      guest: {
        id: 'g1',
        items: [
          { id: 'gi1', variantId: 'v1', productId: 'p1', quantity: 2 },
          { id: 'gi2', variantId: 'v2', productId: 'p2', quantity: 8 },
          { id: 'gi3', variantId: 'v3', productId: 'p3', quantity: 1 },
        ],
      },
      userCart: { id: 'u1' },
      variants: [
        { id: 'v1', stock: 10, price: 500 },
        { id: 'v2', stock: 10, price: 300 },
        { id: 'v3', stock: 0, price: 100 }, // out of stock → skipped
      ],
      existing: { v1: 3 }, // user already has 3 of v1
    });

    await service(prisma).mergeGuestCartIntoUser('sess', 42);

    const byVariant = Object.fromEntries(upserts.map((u) => [u.variantId, u.quantity]));
    expect(byVariant.v1).toBe(5); // 3 existing + 2 guest, under stock 10
    expect(byVariant.v2).toBe(8); // 0 existing + 8 guest
    expect(byVariant.v3).toBeUndefined(); // out of stock, never upserted
    expect(deletedCarts).toContain('g1'); // guest cart removed after folding in
  });

  it('caps the coalesced quantity at live stock', async () => {
    const { prisma, upserts } = makePrisma({
      guest: {
        id: 'g1',
        items: [{ id: 'gi1', variantId: 'v1', productId: 'p1', quantity: 8 }],
      },
      userCart: { id: 'u1' },
      variants: [{ id: 'v1', stock: 10, price: 500 }],
      existing: { v1: 5 }, // 5 + 8 = 13, but only 10 in stock
    });

    await service(prisma).mergeGuestCartIntoUser('sess', 42);
    expect(upserts).toEqual([{ variantId: 'v1', quantity: 10 }]);
  });

  it('adopts the guest cart wholesale when the user has none', async () => {
    const { prisma } = makePrisma({
      guest: {
        id: 'g1',
        items: [{ id: 'gi1', variantId: 'v1', productId: 'p1', quantity: 2 }],
      },
      userCart: null,
      variants: [{ id: 'v1', stock: 10, price: 500 }],
      existing: {},
    });

    await service(prisma).mergeGuestCartIntoUser('sess', 42);
    // Ownership transferred onto the existing guest row (no per-item upsert).
    expect(prisma.cart.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'g1' },
        data: expect.objectContaining({ userId: 42, sessionId: null }),
      }),
    );
    expect(prisma.cartItem.upsert).not.toHaveBeenCalled();
  });
});
