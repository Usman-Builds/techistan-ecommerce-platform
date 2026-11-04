import { Prisma } from '@prisma/client';

/**
 * Take `quantity` units of a variant, only if that many are in stock (#6).
 * The condition is re-checked under the row lock, so two concurrent sales of
 * the last unit can't both succeed.
 *
 * @returns false when there wasn't enough stock (nothing was changed).
 */
export async function takeStock(
  tx: Prisma.TransactionClient,
  variantId: string,
  quantity: number,
): Promise<boolean> {
  const { count } = await tx.productVariant.updateMany({
    where: { id: variantId, stock: { gte: quantity } },
    data: { stock: { decrement: quantity } },
  });
  return count === 1;
}
