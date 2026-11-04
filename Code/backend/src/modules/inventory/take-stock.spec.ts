import { lowStockCrossings, takeStock } from './take-stock';

/** #6 / #16: guarded stock decrement and low-stock threshold crossings. */
function db(
  opts: { count?: number; stockLeft?: number; threshold?: number | null } = {},
) {
  return {
    productVariant: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.count ?? 1 }),
      findUniqueOrThrow: jest
        .fn()
        .mockResolvedValue({ stock: opts.stockLeft ?? 4 }),
      findMany: jest.fn(({ where }: { where: { id: { in: string[] } } }) =>
        Promise.resolve(
          where.id.in.map((id) => ({
            id,
            sku: `SKU-${id}`,
            product: { id: `p-${id}`, title: `Product ${id}` },
          })),
        ),
      ),
    },
    storeSetting: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          opts.threshold === null
            ? null
            : { lowStockThreshold: opts.threshold ?? 5 },
        ),
    },
  };
}

describe('takeStock', () => {
  it('decrements only while enough stock is left', async () => {
    const tx = db({ stockLeft: 4 });
    await expect(takeStock(tx as never, 'v1', 2)).resolves.toEqual({
      variantId: 'v1',
      quantity: 2,
      stock: 4,
    });
    expect(tx.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    });
  });

  it('returns null and changes nothing when stock is short', async () => {
    const tx = db({ count: 0 });
    await expect(takeStock(tx as never, 'v1', 2)).resolves.toBeNull();
    expect(tx.productVariant.findUniqueOrThrow).not.toHaveBeenCalled();
  });
});

describe('lowStockCrossings', () => {
  it('alerts a sale that crosses the threshold', async () => {
    const alerts = await lowStockCrossings(db() as never, [
      { variantId: 'v1', quantity: 2, stock: 4 }, // 6 → 4
    ]);
    expect(alerts).toEqual([
      {
        variantId: 'v1',
        productId: 'p-v1',
        productTitle: 'Product v1',
        sku: 'SKU-v1',
        stock: 4,
        threshold: 5,
      },
    ]);
  });

  it('alerts landing exactly on the threshold', async () => {
    const alerts = await lowStockCrossings(db() as never, [
      { variantId: 'v1', quantity: 1, stock: 5 }, // 6 → 5
    ]);
    expect(alerts).toHaveLength(1);
  });

  it('ignores stock that stays above, or was already at or below', async () => {
    const tx = db();
    const alerts = await lowStockCrossings(tx as never, [
      { variantId: 'above', quantity: 3, stock: 17 }, // 20 → 17
      { variantId: 'low', quantity: 1, stock: 3 }, // 4 → 3
    ]);
    expect(alerts).toEqual([]);
    expect(tx.productVariant.findMany).not.toHaveBeenCalled();
  });

  it('uses the default threshold when none is configured', async () => {
    const alerts = await lowStockCrossings(db({ threshold: null }) as never, [
      { variantId: 'v1', quantity: 2, stock: 5 }, // 7 → 5, default 5
    ]);
    expect(alerts[0]?.threshold).toBe(5);
  });

  it('does nothing for an empty sale', async () => {
    const tx = db();
    await expect(lowStockCrossings(tx as never, [])).resolves.toEqual([]);
    expect(tx.storeSetting.findFirst).not.toHaveBeenCalled();
  });
});
