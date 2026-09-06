import { Controller, Get, Query } from '@nestjs/common';
import { AdminOnly } from '../../common';
import { AnalyticsService } from './analytics.service';
import {
  AnalyticsQueryDto,
  TopProductsQueryDto,
} from './dto/analytics-query.dto';

/**
 * Admin analytics dashboard endpoints (script 15, FR-801). All `@AdminOnly()`
 * (JwtAuthGuard + RolesGuard, ADMIN|SUPER_ADMIN). Reads only — no audit rows.
 */
@AdminOnly()
@Controller('admin/analytics')
export class AdminAnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** KPI cards: revenue today/week/month/year + AOV. */
  @Get('revenue-summary')
  revenueSummary() {
    return this.analytics.revenueSummary();
  }

  /** Order counts by status + daily revenue/order time series for the range. */
  @Get('order-stats')
  orderStats(@Query() q: AnalyticsQueryDto) {
    return this.analytics.orderStats(q.from, q.to);
  }

  /** Best-selling products by units sold in the range. */
  @Get('top-products')
  topProducts(@Query() q: TopProductsQueryDto) {
    return this.analytics.topProducts(q.from, q.to, q.limit ?? 10);
  }

  /** Conversion proxy (paid orders ÷ carts created) + AOV. */
  @Get('conversion')
  conversion(@Query() q: AnalyticsQueryDto) {
    return this.analytics.conversion(q.from, q.to);
  }
}
