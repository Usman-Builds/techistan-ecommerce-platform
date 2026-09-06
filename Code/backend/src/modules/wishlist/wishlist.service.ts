import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { CartService } from '../cart/cart.service';

/**
 * Wishlist domain (script 09, FR-307). Customer-only (the controller guards
 * every route with JWT + `@Roles(CUSTOMER)`). Items are unique per user+product
 * (idempotent add). Cards are hydrated via {@link ProductService.getCardsByIds}
 * so the list shares the storefront card shape (ACTIVE-only, order preserved).
 */
@Injectable()
export class WishlistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
    private readonly cart: CartService,
  ) {}

  /** List the customer's wishlist as product cards, most-recently-added first. */
  async list(userId: number) {
    const rows = await this.prisma.wishlistItem.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { productId: true },
    });
    return this.products.getCardsByIds(rows.map((r) => r.productId));
  }

  /** Add a product (idempotent). Returns the updated list. */
  async add(userId: number, productId: string) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.prisma.wishlistItem.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: {}, // already present → no-op (idempotent)
    });
    return this.list(userId);
  }

  /** Remove a product (idempotent — no error if it was not wishlisted). */
  async remove(userId: number, productId: string) {
    await this.prisma.wishlistItem.deleteMany({
      where: { userId, productId },
    });
    return this.list(userId);
  }

  /**
   * Move a wishlisted product into the customer's cart: add its cheapest in-stock
   * variant (falling back to the cheapest variant) then remove it from the
   * wishlist. The add is stock-clamped by CartService.
   */
  async moveToCart(userId: number, productId: string) {
    const item = await this.prisma.wishlistItem.findUnique({
      where: { userId_productId: { userId, productId } },
      select: { productId: true },
    });
    if (!item) throw new NotFoundException('Item is not in the wishlist');

    const variant =
      (await this.prisma.productVariant.findFirst({
        where: { productId, stock: { gt: 0 } },
        orderBy: { price: 'asc' },
        select: { id: true },
      })) ??
      (await this.prisma.productVariant.findFirst({
        where: { productId },
        orderBy: { price: 'asc' },
        select: { id: true },
      }));
    if (!variant) {
      throw new BadRequestException('This product has no purchasable variant.');
    }

    const cart = await this.cart.getOrCreateUserCart(userId);
    const cartView = await this.cart.addItem(cart.id, variant.id, 1); // clamps to stock
    await this.prisma.wishlistItem.delete({
      where: { userId_productId: { userId, productId } },
    });

    return { moved: true, cart: cartView };
  }
}
