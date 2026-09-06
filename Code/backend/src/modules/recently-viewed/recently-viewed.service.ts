import { Injectable, NotFoundException } from '@nestjs/common';
import { ProductStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProductService } from '../product/product.service';
import { RECENTLY_VIEWED_LIMIT } from './recently-viewed.constants';

/**
 * Recently-viewed products (FR-224). Signed-in customers get a server-persisted
 * per-account list (`RecentlyViewed` table); guests get the same feature via a
 * cookie the controller manages. Both paths hydrate to product cards via
 * {@link ProductService.getCardsByIds} (ACTIVE-only, order preserved).
 */
@Injectable()
export class RecentlyViewedService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly products: ProductService,
  ) {}

  /** Throw 404 unless the product exists and is ACTIVE (viewable). */
  async assertViewable(productId: string): Promise<void> {
    const found = await this.prisma.product.findFirst({
      where: { id: productId, status: ProductStatus.ACTIVE },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Product not found');
  }

  /** Record a view for a signed-in customer (upsert + trim to the cap). */
  async recordForUser(userId: number, productId: string): Promise<void> {
    await this.prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId, productId } },
      create: { userId, productId },
      update: { viewedAt: new Date() },
    });

    // Trim anything beyond the most-recent LIMIT.
    const overflow = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      skip: RECENTLY_VIEWED_LIMIT,
      select: { id: true },
    });
    if (overflow.length) {
      await this.prisma.recentlyViewed.deleteMany({
        where: { id: { in: overflow.map((r) => r.id) } },
      });
    }
  }

  /** Hydrated cards for a signed-in customer, most-recent first. */
  async listForUser(userId: number) {
    const rows = await this.prisma.recentlyViewed.findMany({
      where: { userId },
      orderBy: { viewedAt: 'desc' },
      take: RECENTLY_VIEWED_LIMIT,
      select: { productId: true },
    });
    return this.products.getCardsByIds(rows.map((r) => r.productId));
  }

  /** Hydrated cards for a guest id list (from the cookie), order preserved. */
  async listForIds(ids: string[]) {
    return this.products.getCardsByIds(ids);
  }
}
