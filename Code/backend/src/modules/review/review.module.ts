import { Module } from '@nestjs/common';
import { ReviewService } from './review.service';
import { ReviewController } from './review.controller';
import { ReviewAdminController } from './review.admin.controller';

/**
 * Reviews module (script 13, FR-701..705). PrismaModule, AuditModule, and
 * NotificationModule are @Global; the "new review" admin alert goes through
 * NotifierService. Verified-purchase checks query Order data through Prisma
 * directly (no OrderModule dependency, so there is no import cycle).
 */
@Module({
  controllers: [ReviewController, ReviewAdminController],
  providers: [ReviewService],
  exports: [ReviewService],
})
export class ReviewModule {}
