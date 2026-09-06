import { Module } from '@nestjs/common';
import { CategoryModule } from '../category/category.module';
import { CouponService } from './coupon.service';
import { CouponController } from './coupon.controller';
import { CouponAdminController } from './coupon.admin.controller';
import { PromotionAdminController } from './promotion.admin.controller';

/**
 * Promotions module (script 12, FR-601..605). Owns coupons, automatic discounts,
 * and scheduled sale pricing. Exposes {@link CouponService} so CartModule (09)
 * and OrderModule/payment webhook (10) can validate codes and record redemptions.
 * PrismaModule and AuditModule are @Global, so nothing needs importing here.
 */
@Module({
  // CategoryModule supplies subtree expansion: a promotion scoped to
  // "Computers" must also cover everything filed under it.
  imports: [CategoryModule],
  controllers: [
    CouponController,
    CouponAdminController,
    PromotionAdminController,
  ],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
