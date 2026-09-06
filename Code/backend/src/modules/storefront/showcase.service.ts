import { Injectable } from '@nestjs/common';
import { ProductStatus, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/** A published review worth putting on the homepage, with what it is about. */
export interface Testimonial {
  id: string;
  rating: number;
  title: string | null;
  body: string;
  author: string;
  createdAt: Date;
  /** Verified = written against a real order. Shown as a badge, never faked. */
  verified: boolean;
  product: {
    title: string;
    slug: string;
    imageUrl: string | null;
  };
}

/** One brand the store actually stocks. */
export interface ShowcaseBrand {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  /** Live, buyable products — the reason this brand is on the strip at all. */
  productCount: number;
}

/** The smallest testimonial worth showing. Four stars, and actual words. */
const MIN_TESTIMONIAL_RATING = 4;
const MIN_TESTIMONIAL_LENGTH = 40;

/**
 * Cross-catalog reads for the homepage's editorial blocks (script 19).
 *
 * These live apart from `HomepageService` on purpose: that service owns the
 * LAYOUT (which blocks, in what order), while this one answers "what should the
 * TESTIMONIALS and BRAND_STRIP blocks actually show". Mixing them would make a
 * layout read pull half the catalog every time the builder opens.
 *
 * Everything here is derived from real rows. There is no seeded praise and no
 * brand the store does not stock: an empty result renders no section at all,
 * which is the honest outcome for a store with no reviews yet.
 */
@Injectable()
export class ShowcaseService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Approved 4★+ reviews across the whole catalog, newest first.
   *
   * Filtered to reviews with enough text to be worth reading — a bare 5★ with
   * no body is a rating, not a testimonial, and a wall of one-word quotes reads
   * as fabricated even when every one is genuine.
   */
  async listTestimonials(limit = 6): Promise<Testimonial[]> {
    const take = Math.min(Math.max(limit, 1), 24);

    const rows = await this.prisma.review.findMany({
      where: {
        status: ReviewStatus.APPROVED,
        rating: { gte: MIN_TESTIMONIAL_RATING },
        // A review of an unpublished product would link to a 404.
        product: { status: ProductStatus.ACTIVE },
      },
      // Most helpful first, then newest: the community has already ranked these
      // better than a date can, and `helpfulCount` is denormalised so it costs
      // nothing to sort on.
      orderBy: [{ helpfulCount: 'desc' }, { createdAt: 'desc' }],
      // Over-fetch so the length filter below cannot empty the section.
      take: take * 3,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        createdAt: true,
        orderId: true,
        user: { select: { firstName: true, lastName: true } },
        product: {
          select: {
            title: true,
            slug: true,
            images: {
              orderBy: { position: 'asc' },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
    });

    return rows
      .filter((r) => (r.body?.trim().length ?? 0) >= MIN_TESTIMONIAL_LENGTH)
      .slice(0, take)
      .map((r) => ({
        id: r.id,
        rating: r.rating,
        title: r.title,
        body: r.body!.trim(),
        author: this.displayName(r.user.firstName, r.user.lastName),
        createdAt: r.createdAt,
        verified: r.orderId !== null,
        product: {
          title: r.product.title,
          slug: r.product.slug,
          imageUrl: r.product.images[0]?.url ?? null,
        },
      }));
  }

  /**
   * Brands with at least one ACTIVE product, busiest first.
   *
   * A brand row with nothing buyable behind it is a data-entry artefact, and
   * putting it on the strip sends shoppers to an empty search. The count is
   * what the storefront uses to decide ordering, so the strip leads with the
   * names the store is actually known for.
   */
  async listBrands(limit = 12): Promise<ShowcaseBrand[]> {
    const take = Math.min(Math.max(limit, 1), 40);

    const rows = await this.prisma.brand.findMany({
      where: { products: { some: { status: ProductStatus.ACTIVE } } },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        _count: {
          select: { products: { where: { status: ProductStatus.ACTIVE } } },
        },
      },
    });

    return rows
      .map((b) => ({
        id: b.id,
        name: b.name,
        slug: b.slug,
        logoUrl: b.logoUrl,
        productCount: b._count.products,
      }))
      .sort(
        (a, b) =>
          b.productCount - a.productCount || a.name.localeCompare(b.name),
      )
      .slice(0, take);
  }

  /** "Ada" + "Lovelace" → "Ada L." — same rule the product page's reviews use. */
  private displayName(firstName: string, lastName: string): string {
    const initial = lastName?.trim()?.[0];
    return initial ? `${firstName} ${initial}.` : firstName;
  }
}
