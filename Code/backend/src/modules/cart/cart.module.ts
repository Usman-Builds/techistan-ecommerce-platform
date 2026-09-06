import { Module } from '@nestjs/common';
import { CouponModule } from '../coupon/coupon.module';
import { CartService } from './cart.service';
import { CartController } from './cart.controller';

/**
 * Cart module (script 09). PrismaModule is @Global; CouponModule supplies the
 * coupon-apply validation hook (FR-304). Exports CartService so the auth flow
 * can merge a guest cart on login (FR-301) and the wishlist can move-to-cart.
 */
@Module({
  imports: [CouponModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}
