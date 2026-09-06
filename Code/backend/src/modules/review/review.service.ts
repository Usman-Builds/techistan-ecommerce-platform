import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus, Prisma, ReviewStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotifierService } from '../notification/notifier.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto, ReviewSort } from './dto/list-reviews-query.dto';
import { ModerateReviewsQueryDto } from './dto/moderate-reviews-query.dto';
import { RejectReviewDto } from './dto/reject-review.dto';

/** Order states that count as "purchased & received" for review eligibility. */
const PURCHASED_STATES: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

/** Cap on review photos, enforced here (schema has no count constraint). */
const MAX_REVIEW_IMAGES = 3;

/** Full public review row (approved) with images, author, and vote state. */
export interface PublicReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  helpfulCount: number;
  author: string;
  createdAt: Date;
  images: { id: string; url: string; alt: string | null }[];
  /** Whether the *current* requester has already marked this review helpful. */
  votedByMe: boolean;
}

/**
 * Reviews domain service (script 13, FR-701..705). Owns verified-purchaser
 * submission, the admin moderation queue, denormalized product aggregate
 * ratings, helpful votes, and public reads. A review is invisible to the
 * storefront until an admin APPROVES it.
 *
 * `ratingAverage` on Product is stored ×100 (integer, e.g. 450 = 4.5) like every
 * other numeric column; {@link recomputeAggregate} keeps it in sync from APPROVED
 * reviews only, inside the same transaction as each moderation action.
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifier: NotifierService,
  ) {}

  // ─────────────────────────── Submission (FR-701) ───────────────────────────

  /**
   * Create a PENDING review. Requires a delivered/completed order containing the
   * product (403 otherwise); one review per user per product (409 on duplicate).
   * Up to {@link MAX_REVIEW_IMAGES} MediaAsset ids are linked as ReviewImages.
   */
  async create(userId: number, dto: CreateReviewDto) {
    const product = await this.prisma.product.findUnique({
      where: { id: dto.productId },
      select: { id: true, title: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    // Verified-purchase gate (FR-701) — derived from order data, not self-asserted.
    const orderId = await this.findVerifyingOrder(userId, dto.productId);
    if (!orderId) {
      throw new ForbiddenException(
        'You can only review products from a delivered order.',
      );
    }

    // One review per user per product (guarded by the unique index too).
    const existing = await this.prisma.review.findUnique({
      where: { productId_userId: { productId: dto.productId, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this product.');
    }

    const images = await this.resolveReviewImages(dto.mediaIds);

    let review;
    try {
      review = await this.prisma.review.create({
        data: {
          productId: dto.productId,
          userId,
          orderId,
          rating: dto.rating,
          title: dto.title?.trim() || null,
          body: dto.body?.trim() || null,
          status: ReviewStatus.PENDING,
          images: images.length ? { create: images } : undefined,
        },
        include: { images: true },
      });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw new ConflictException('You have already reviewed this product.');
      }
      throw err;
    }

    // Admin "new review" alert — bell for all admins + optional admin email.
    void this.notifier.newReview({
      productId: product.id,
      productTitle: product.title,
      rating: review.rating,
      reviewId: review.id,
    });

    return review;
  }

  // ─────────────────────────── Public reads (FR-705) ─────────────────────────

  /**
   * Paginated APPROVED reviews for a product plus the star distribution and
   * aggregate. `currentUserId` (from the optional JWT guard) flags which reviews
   * the requester has already voted helpful so the client can disable the button.
   */
  async listPublic(query: ListReviewsQueryDto, currentUserId?: number | null) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;
    const where: Prisma.ReviewWhereInput = {
      productId: query.productId,
      status: ReviewStatus.APPROVED,
    };

    const [rows, total, product] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: this.orderByFor(query.sort),
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { select: { id: true, url: true, alt: true } },
          user: { select: { firstName: true, lastName: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.product.findUnique({
        where: { id: query.productId },
        select: { ratingAverage: true, ratingCount: true },
      }),
    ]);

    // Star distribution (counts per rating) for the summary bar chart (FR-705).
    const distribution = await this.prisma.review.groupBy({
      by: ['rating'],
      where,
      _count: { rating: true },
      orderBy: { rating: 'asc' },
    });

    // Which of these reviews the current user has voted helpful (single query).
    let votedSet = new Set<string>();
    if (currentUserId && rows.length) {
      const votes = await this.prisma.reviewVote.findMany({
        where: { userId: currentUserId, reviewId: { in: rows.map((r) => r.id) } },
        select: { reviewId: true },
      });
      votedSet = new Set(votes.map((v) => v.reviewId));
    }

    const items: PublicReview[] = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      helpfulCount: r.helpfulCount,
      author: this.displayName(r.user.firstName, r.user.lastName),
      createdAt: r.createdAt,
      images: r.images,
      votedByMe: votedSet.has(r.id),
    }));

    // Fill all five buckets so the client always has a complete distribution.
    const stars: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const d of distribution) {
      stars[d.rating as 1 | 2 | 3 | 4 | 5] = d._count.rating;
    }

    return {
      items,
      total,
      page,
      pageSize,
      aggregate: {
        // Expose the ×100 integer as a float for the client (null when no reviews).
        average: product && product.ratingCount > 0 ? product.ratingAverage / 100 : null,
        count: product?.ratingCount ?? 0,
      },
      distribution: stars,
    };
  }

  // ─────────────────────────── Helpful votes (FR-704) ────────────────────────

  /**
   * Mark an APPROVED review helpful. Idempotent per user via the unique
   * (reviewId, userId) index — a repeat vote is a no-op. The insert and the
   * `helpfulCount` increment commit atomically.
   */
  async voteHelpful(reviewId: string, userId: number) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, status: true, helpfulCount: true },
    });
    if (!review) throw new NotFoundException('Review not found');
    if (review.status !== ReviewStatus.APPROVED) {
      throw new BadRequestException('You can only vote on approved reviews.');
    }

    // Already voted? Report the current count without double-counting.
    const already = await this.prisma.reviewVote.findUnique({
      where: { reviewId_userId: { reviewId, userId } },
      select: { id: true },
    });
    if (already) {
      return { reviewId, helpfulCount: review.helpfulCount, voted: true };
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.reviewVote.create({ data: { reviewId, userId } });
      return tx.review.update({
        where: { id: reviewId },
        data: { helpfulCount: { increment: 1 } },
        select: { helpfulCount: true },
      });
    });

    return { reviewId, helpfulCount: updated.helpfulCount, voted: true };
  }

  // ─────────────────────────── Moderation (FR-702) ───────────────────────────

  /** Admin queue — paginated, filtered by status (default PENDING). */
  async listForModeration(query: ModerateReviewsQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const where: Prisma.ReviewWhereInput = {
      status: query.status ?? ReviewStatus.PENDING,
    };

    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({
        where,
        orderBy: { createdAt: 'asc' }, // oldest first — a FIFO moderation queue
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          images: { select: { id: true, url: true, alt: true } },
          product: { select: { id: true, title: true, slug: true } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.review.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  /** Approve a review, then recompute the product aggregate (FR-703). */
  async approve(id: string, actorId: number | null) {
    return this.moderate(id, ReviewStatus.APPROVED, actorId);
  }

  /** Reject a review (with optional reason), then recompute the aggregate. */
  async reject(id: string, dto: RejectReviewDto, actorId: number | null) {
    return this.moderate(id, ReviewStatus.REJECTED, actorId, dto.reason);
  }

  private async moderate(
    id: string,
    status: ReviewStatus,
    actorId: number | null,
    reason?: string,
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id },
      select: { id: true, productId: true, status: true },
    });
    if (!review) throw new NotFoundException('Review not found');

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.review.update({
        where: { id },
        data: { status },
      });
      await this.recomputeAggregate(tx, review.productId);
      return r;
    });

    await this.audit.record({
      actorId,
      action: status === ReviewStatus.APPROVED ? 'review.approve' : 'review.reject',
      entityType: 'Review',
      entityId: id,
      metadata: {
        productId: review.productId,
        ...(reason ? { reason } : {}),
      },
    });

    return updated;
  }

  // ─────────────────────────── Internals ───────────────────────────

  /**
   * Recompute a product's denormalized aggregate rating from APPROVED reviews
   * only. `ratingAverage` is stored ×100 (rounded). Runs inside the caller's tx
   * so the review status change and the aggregate never drift apart.
   */
  private async recomputeAggregate(
    tx: Prisma.TransactionClient,
    productId: string,
  ): Promise<void> {
    const agg = await tx.review.aggregate({
      where: { productId, status: ReviewStatus.APPROVED },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const count = agg._count.rating;
    const average = count > 0 ? Math.round((agg._avg.rating ?? 0) * 100) : 0;
    await tx.product.update({
      where: { id: productId },
      data: { ratingAverage: average, ratingCount: count },
    });
  }

  /**
   * Return the id of a delivered/completed order belonging to `userId` that
   * contains `productId` (via the order item's variant), or null if none — the
   * verified-purchase proof captured on the review.
   */
  private async findVerifyingOrder(
    userId: number,
    productId: string,
  ): Promise<string | null> {
    const order = await this.prisma.order.findFirst({
      where: {
        userId,
        status: { in: PURCHASED_STATES },
        items: { some: { variant: { productId } } },
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    return order?.id ?? null;
  }

  /**
   * Resolve up to {@link MAX_REVIEW_IMAGES} MediaAsset ids into ReviewImage
   * create rows (copying the Cloudinary reference). Rejects unknown ids and any
   * count over the cap.
   */
  private async resolveReviewImages(
    mediaIds?: string[],
  ): Promise<{ cloudinaryPublicId: string; url: string; alt: string | null }[]> {
    if (!mediaIds || mediaIds.length === 0) return [];
    const unique = [...new Set(mediaIds)];
    if (unique.length > MAX_REVIEW_IMAGES) {
      throw new BadRequestException(
        `A review can have at most ${MAX_REVIEW_IMAGES} photos.`,
      );
    }
    const assets = await this.prisma.mediaAsset.findMany({
      where: { id: { in: unique } },
      select: { cloudinaryPublicId: true, url: true, alt: true },
    });
    if (assets.length !== unique.length) {
      throw new BadRequestException('One or more media ids are invalid.');
    }
    return assets.map((a) => ({
      cloudinaryPublicId: a.cloudinaryPublicId,
      url: a.url,
      alt: a.alt ?? null,
    }));
  }

  /** Public-facing author name: first name + last initial (privacy-preserving). */
  private displayName(firstName: string, lastName: string): string {
    const initial = lastName?.trim()?.[0];
    return initial ? `${firstName} ${initial}.` : firstName;
  }

  private orderByFor(sort?: ReviewSort): Prisma.ReviewOrderByWithRelationInput[] {
    switch (sort) {
      case 'helpful':
        return [{ helpfulCount: 'desc' }, { createdAt: 'desc' }];
      case 'rating':
        return [{ rating: 'desc' }, { createdAt: 'desc' }];
      case 'newest':
      default:
        return [{ createdAt: 'desc' }];
    }
  }
}
