import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * InventoryService.adjust (script 15, FR-805/902, #47): the optimistic stock
 * write (#17), its audit entry, and the admin low-stock alert, which must fire
 * only when the stock crosses the threshold on the way down.
 */
function setup(
  opts: {
    stock?: number;
    missing?: boolean;
    threshold?: number | null;
    writeCount?: number;
  } = {},
) {
  let stock = opts.stock ?? 10;
  const variant = () => ({
    id: 'v1',
    sku: 'SKU-1',
    stock,
    price: 2500,
    options: { Size: 'M' },
    product: { id: 'p1', title: 'Kettle', slug: 'kettle', status: 'ACTIVE' },
  });
  const prisma = {
    productVariant: {
      findUnique: jest.fn(() =>
        Promise.resolve(opts.missing ? null : { id: 'v1', stock }),
      ),
      updateMany: jest.fn(
        ({ data }: { where: { stock: number }; data: { stock: number } }) => {
          const count = opts.writeCount ?? 1;
          if (count === 1) stock = data.stock;
          return Promise.resolve({ count });
        },
      ),
      findUniqueOrThrow: jest.fn(() => Promise.resolve(variant())),
    },
    storeSetting: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          opts.threshold === null
            ? null
            : { lowStockThreshold: opts.threshold ?? 5 },
        ),
      ),
    },
  };
  const audit = { record: jest.fn(() => Promise.resolve()) };
  const notifier = { lowStock: jest.fn(() => Promise.resolve()) };
  const service = new InventoryService(
    prisma as never,
    audit as never,
    {} as never,
    notifier as never,
  );
  return { service, prisma, audit, notifier };
}

describe('InventoryService.adjust (#47)', () => {
  it('writes the new stock against the value it read, and audits it', async () => {
    const { service, prisma, audit } = setup({ stock: 10 });

    const item = await service.adjust('v1', 7, 42);

    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', stock: 10 },
      data: { stock: 7 },
    });
    expect(audit.record).toHaveBeenCalledWith({
      actorId: 42,
      action: 'inventory.adjust',
      entityType: 'ProductVariant',
      entityId: 'v1',
      metadata: { from: 10, to: 7 },
    });
    expect(item).toMatchObject({ variantId: 'v1', stock: 7, lowStock: false });
  });

  it('guards on the stock the admin saw when it is sent', async () => {
    const { service, prisma } = setup({ stock: 10 });
    await service.adjust('v1', 12, 1, 9);
    expect(prisma.productVariant.updateMany).toHaveBeenCalledWith({
      where: { id: 'v1', stock: 9 },
      data: { stock: 12 },
    });
  });

  it('409s when the stock changed in between (a sale landed)', async () => {
    const { service, audit, notifier } = setup({ writeCount: 0 });
    await expect(service.adjust('v1', 3, 1, 10)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(audit.record).not.toHaveBeenCalled();
    expect(notifier.lowStock).not.toHaveBeenCalled();
  });

  it('404s for an unknown variant', async () => {
    const { service, prisma } = setup({ missing: true });
    await expect(service.adjust('nope', 3)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.productVariant.updateMany).not.toHaveBeenCalled();
  });

  describe('low-stock alert', () => {
    it('fires once when stock crosses the threshold downward', async () => {
      const { service, notifier } = setup({ stock: 8, threshold: 5 });
      const item = await service.adjust('v1', 5, 1);
      expect(notifier.lowStock).toHaveBeenCalledTimes(1);
      expect(notifier.lowStock).toHaveBeenCalledWith({
        variantId: 'v1',
        productId: 'p1',
        productTitle: 'Kettle',
        sku: 'SKU-1',
        stock: 5,
        threshold: 5,
      });
      expect(item.lowStock).toBe(true);
    });

    it('stays quiet while a variant that is already low moves within the band', async () => {
      const { service, notifier } = setup({ stock: 4, threshold: 5 });
      await service.adjust('v1', 2, 1);
      expect(notifier.lowStock).not.toHaveBeenCalled();
    });

    it('stays quiet when restocking above the threshold', async () => {
      const { service, notifier } = setup({ stock: 2, threshold: 5 });
      await service.adjust('v1', 20, 1);
      expect(notifier.lowStock).not.toHaveBeenCalled();
    });

    it('defaults the threshold to 5 when no store setting exists', async () => {
      const { service, notifier } = setup({ stock: 6, threshold: null });
      await expect(service.threshold()).resolves.toBe(5);
      await service.adjust('v1', 5, 1);
      expect(notifier.lowStock).toHaveBeenCalledTimes(1);
    });
  });
});
