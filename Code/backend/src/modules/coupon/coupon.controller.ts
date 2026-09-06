import { Controller, Get } from '@nestjs/common';
import { CouponService } from './coupon.service';

/**
 * Public promotions surface (FR-603). Exposes the currently-active automatic
 * discounts so the storefront can render a promo banner ("Buy 3, get 10% off").
 * Coupon *application* is owned by the cart (`POST /cart/coupon`, script 09);
 * redemption is finalized server-side at payment success (script 10).
 */
@Controller('promotions')
export class CouponController {
  constructor(private readonly coupons: CouponService) {}

  @Get('automatic-discounts')
  activeAutomaticDiscounts() {
    return this.coupons.listActiveAutomaticDiscounts();
  }

  /**
   * Coupon codes the merchant chose to advertise, for the storefront offers
   * strip. Only `isPublic` coupons appear here — a code mailed to a segment
   * must never leak through a public endpoint just because it is active.
   */
  @Get('offers')
  offers() {
    return this.coupons.listPublicOffers();
  }
}
