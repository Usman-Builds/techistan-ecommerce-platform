import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { ReviewService } from './review.service';
import { ModerateReviewsQueryDto } from './dto/moderate-reviews-query.dto';
import { RejectReviewDto } from './dto/reject-review.dto';

/**
 * Admin review moderation (FR-702). `@AdminOnly()` layers JwtAuthGuard +
 * RolesGuard (ADMIN | SUPER_ADMIN) — RBAC is enforced server-side (NFR-208).
 * Each moderation action writes an AuditLog (FR-808) and recomputes the product
 * aggregate rating.
 */
@AdminOnly()
@Controller('admin/reviews')
export class ReviewAdminController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  queue(@Query() query: ModerateReviewsQueryDto) {
    return this.reviews.listForModeration(query);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.reviews.approve(id, actorId);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectReviewDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.reviews.reject(id, dto, actorId);
  }
}
