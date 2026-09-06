import { Module } from '@nestjs/common';
import { AdminAnalyticsController } from './admin-analytics.controller';
import { AnalyticsService } from './analytics.service';

/**
 * Admin analytics (script 15, FR-801). PrismaService is @Global. Read-only
 * aggregate queries backing the dashboard KPIs and charts.
 */
@Module({
  controllers: [AdminAnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
