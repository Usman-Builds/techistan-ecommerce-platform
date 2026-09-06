import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { CloudinaryProvider } from './cloudinary.provider';

/**
 * Media module (script 06). PrismaModule is @Global and ConfigModule is global,
 * so no extra imports are needed. Exports MediaService for reuse by later
 * product/review flows (scripts 07, 13).
 */
@Module({
  controllers: [MediaController],
  providers: [MediaService, CloudinaryProvider],
  exports: [MediaService],
})
export class MediaModule {}
