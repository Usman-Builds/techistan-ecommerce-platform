import { Prisma } from '@prisma/client';

export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

/** What a sale took from one variant, and what's left. */
export interface StockTaken {
  variantId: string;
  quantity: number;
  /** Stock remaining after this sale. */
  stock: number;
}

/** Payload for NotifierService.lowStock. */
export interface LowStockAlert {
  variantId: string;
  productId: string;
  productTitle: string;
  sku: string;
  stock: number;
  threshold: number;
}

type Db = Pick<Prisma.TransactionClient, 'productVariant' | 'storeSetting'>;

/**
 * Take `quantity` units of a variant, only if that many are in stock (#6).
 * The condition is re-checked under the row lock, so two concurrent sales of
 * the last unit can't both succeed.
 *
 * @returns what was taken and what's left, or null when there wasn't enough
 * stock (nothing was changed).
 */
export async function takeStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
): Promise<StockTaken | null> {
  const { count } = await tx.productVariant.updateMany({
    where: { id: variantId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  if (count !== 1) return null;
  // Our update holds the row lock, so this is the stock this sale left.
  const { stock } = await tx.productVariant.findUniqueOrThrow({
    where: { id: variantId },
    select: { stock: true },
  });
  return { variantId, quantity, stock };
}

/** The store's low-stock threshold (StoreSetting, default 5). */
export async function lowStockThreshold(db: Db): Promise<number> {
  const s = await db.storeSetting.findFirst({
    where: { singleton: true },
    select: { lowStockThreshold: true },
  });
  return s?.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
}

/**
 * The sales that took a variant from above the low-stock threshold to at or
 * below it (#16), as alerts to send after commit. Only a downward crossing
 * counts, so a variant that's already low isn't re-alerted on every sale.
 */
export async function lowStockCrossings(
  db: Db,
  taken: StockTaken[],
): Promise<LowStockAlert[]> {
  if (taken.length === 0) return [];
  const threshold = await lowStockThreshold(db);
  const crossed = taken.filter(
    (t) => t.stock <= threshold && t.stock + t.quantity > threshold,
  );
  if (crossed.length === 0) return [];
  const rows = await db.productVariant.findMany({
    where: { id: { in: crossed.map((t) => t.variantId) } },
    select: {
      id: true,
      sku: true,
      product: { select: { id: true, title: true } },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return crossed.flatMap((t) => {
    const row = byId.get(t.variantId);
    if (!row) return [];
    return [
      {
        variantId: row.id,
        productId: row.product.id,
        productTitle: row.product.title,
        sku: row.sku,
        stock: t.stock,
        threshold,
      },
    ];
  });
}
