import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, JwtAuthGuard } from 'src/common';
import { MediaService } from './media.service';
import { SaveReviewMediaDto } from './dto/save-review-media.dto';

/**
 * Customer review photos (FR-705, #33). The admin media library
 * (`/media`, MediaController) stays admin-only; these two routes let any
 * signed-in customer upload into the reviews folder ONLY, and record them as
 * the uploader so a review can attach just its author's own photos. The
 * Cloudinary secret never leaves the server.
 */
@UseGuards(JwtAuthGuard)
@Throttle({ default: { limit: 20, ttl: 60_000 } })
@Controller('reviews/media')
export class ReviewMediaController {
  constructor(private readonly media: MediaService) {}

  /** Signature for one direct upload into the reviews folder. */
  @Post('upload-signature')
  @HttpCode(200)
  createSignature() {
    return this.media.createReviewUploadSignature();
  }

  /** Confirm an uploaded review photo (verified with Cloudinary). */
  @Post()
  save(@Body() dto: SaveReviewMediaDto, @CurrentUser('userId') userId: number) {
    return this.media.saveReviewMedia(userId, dto);
  }
}
