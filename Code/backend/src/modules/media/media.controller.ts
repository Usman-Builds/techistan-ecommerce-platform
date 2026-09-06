import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AdminOnly } from 'src/common';
import { MediaService } from './media.service';
import { CreateSignatureDto } from './dto/create-signature.dto';
import { SaveMediaDto } from './dto/save-media.dto';

/**
 * All media endpoints are admin-only (NFR-208): `@AdminOnly()` layers
 * JwtAuthGuard + RolesGuard and requires ADMIN or SUPER_ADMIN. The Cloudinary
 * API secret never leaves the server — clients only ever receive a signature.
 */
@AdminOnly()
@Controller('media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  /** Issue a signed upload signature for a direct-to-Cloudinary upload. */
  @Post('upload-signature')
  @HttpCode(200)
  createSignature(@Body() dto: CreateSignatureDto) {
    return this.media.createUploadSignature(dto);
  }

  /** Persist a confirmed upload (ProductImage if productId, else MediaAsset). */
  @Post()
  save(@Body() dto: SaveMediaDto) {
    return this.media.saveMedia(dto);
  }

  /** Library listing for the admin media page. */
  @Get()
  list(@Query('search') search?: string) {
    return this.media.listMedia(search);
  }

  /**
   * Delete by Cloudinary public_id. public_ids contain slashes (folder paths),
   * so the client MUST `encodeURIComponent(publicId)` — it then arrives as a
   * single path segment and is decoded back here.
   */
  @Delete(':publicId')
  remove(@Param('publicId') publicId: string) {
    return this.media.deleteMedia(publicId);
  }
}
