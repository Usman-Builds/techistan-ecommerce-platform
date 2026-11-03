import { ConflictException, NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';

/**
 * Stock adjustment is an absolute "set" (FR-805), so it must not overwrite a
 * sale that landed after the admin loaded the page (#17). The client sends the
 * stock it saw as `expectedStock`; the write only applies while the row still
 * holds that value, otherwise 409.
 */
const tick = () => new Promise((r) => setImmediate(r));

function setup(initialStock: number) {
  const row = { id: 'v1', stock: initialStock };
  const view = () => ({
    id: row.id,
    sku: 'SKU-1',
    stock: row.stock,
    price: 1000,
    product: { id: 'p1', title: 'Thing', slug: 'thing', status: 'ACTIVE' },
  });
  const productVariant = {
    findUnique: jest.fn(
      async ({ select }: { select?: { product?: unknown } }) => {
        const snap = select?.product
          ? view()
          : { id: row.id, stock: row.stock };
        await tick();
        return snap;
      },
    ),
    findUniqueOrThrow: jest.fn(() => Promise.resolve(view())),
    update: jest.fn(async ({ data }: { data: { stock: number } }) => {
      await tick();
      row.stock = data.stock;
      return view();
    }),
    updateMany: jest.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; stock?: number };
        data: { stock: number };
      }) => {
        await tick();
        if (where.stock !== undefined && where.stock !== row.stock) {
          return { count: 0 };
        }
        row.stock = data.stock;
        return { count: 1 };
      },
    ),
  };
  const prisma = {
    productVariant,
    setting: { findUnique: jest.fn().mockResolvedValue(null) },
    storeSettings: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifier = { lowStock: jest.fn().mockResolvedValue(undefined) };
  const service = new InventoryService(
    prisma as never,
    audit as never,
    {} as never,
    notifier as never,
  );
  // The threshold lookup reads settings; it isn't under test here.
  jest
    .spyOn(
      service as unknown as { threshold: () => Promise<number> },
      'threshold',
    )
    .mockResolvedValue(5);
  return { service, row, audit };
}

describe('InventoryService.adjust (#17)', () => {
  it('rejects a stale absolute set with 409 and keeps the concurrent sale', async () => {
    // Admin loaded 10, typed 15 after a delivery of 5; meanwhile 2 units sold.
    const { service, row } = setup(10);
    row.stock = 8;

    await expect(service.adjust('v1', 15, 1, 10)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(row.stock).toBe(8);
  });

  it('applies the set when the stock is still what the admin saw', async () => {
    const { service, row, audit } = setup(10);
    const res = await service.adjust('v1', 15, 1, 10);
    expect(row.stock).toBe(15);
    expect(res.stock).toBe(15);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { from: 10, to: 15 } }),
    );
  });

  it('does not lose a sale that lands between its own read and write', async () => {
    // No expectedStock (older client): the server still compares against the
    // value it read, so a decrement in between turns into a 409, not a lost update.
    const { service, row } = setup(10);
    const pending = service.adjust('v1', 15, 1);
    await tick(); // let the service read 10 first
    row.stock = 8; // a sale commits before the write
    await expect(pending).rejects.toBeInstanceOf(ConflictException);
    expect(row.stock).toBe(8);
  });

  it('404s for an unknown variant', async () => {
    const { service } = setup(10);
    (
      service as unknown as {
        prisma: { productVariant: { findUnique: jest.Mock } };
      }
    ).prisma.productVariant.findUnique.mockResolvedValueOnce(null);
    await expect(service.adjust('nope', 1, 1)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
