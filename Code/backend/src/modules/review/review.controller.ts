import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser, JwtAuthGuard, OptionalJwtAuthGuard } from '../../common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';

/**
 * Customer-facing reviews API (script 13, FR-701/704/705).
 *  - `GET  /reviews`          — public (APPROVED only); optional JWT flags own votes.
 *  - `POST /reviews`          — authenticated verified purchaser submits a review.
 *  - `POST /reviews/:id/helpful` — authenticated helpful vote (idempotent).
 */
@Controller('reviews')
export class ReviewController {
  constructor(private readonly reviews: ReviewService) {}

  @Get()
  @UseGuards(OptionalJwtAuthGuard)
  list(
    @Query() query: ListReviewsQueryDto,
    @CurrentUser('userId') userId: number | undefined,
  ) {
    return this.reviews.listPublic(query, userId ?? null);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Body() dto: CreateReviewDto,
    @CurrentUser('userId') userId: number,
  ) {
    return this.reviews.create(userId, dto);
  }

  @Post(':id/helpful')
  @UseGuards(JwtAuthGuard)
  helpful(@Param('id') id: string, @CurrentUser('userId') userId: number) {
    return this.reviews.voteHelpful(id, userId);
  }
}
