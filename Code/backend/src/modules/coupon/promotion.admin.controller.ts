import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { CouponService } from './coupon.service';
import {
  CreateAutomaticDiscountDto,
  UpdateAutomaticDiscountDto,
} from './dto/automatic-discount.dto';
import { BulkSaleDto, SetSalePriceDto } from './dto/set-sale-price.dto';

/**
 * Admin management for automatic (no-code) discounts and scheduled product sales
 * (FR-603/604/806). Shares the promotions domain with {@link CouponAdminController}
 * but lives under the broader `admin/` prefix so it can reach product sales at
 * `admin/products/:id/sale` (a distinct path from the catalog controller's
 * `admin/products/:id`). `@AdminOnly()` enforces RBAC; every write is audited.
 */
@AdminOnly()
@Controller('admin')
export class PromotionAdminController {
  constructor(private readonly coupons: CouponService) {}

  // ── Automatic discounts ──────────────────────────────────────────────────
  @Post('automatic-discounts')
  createDiscount(
    @Body() dto: CreateAutomaticDiscountDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.createAutomaticDiscount(dto, actorId);
  }

  @Get('automatic-discounts')
  listDiscounts() {
    return this.coupons.listAutomaticDiscounts();
  }

  @Get('automatic-discounts/:id')
  getDiscount(@Param('id') id: string) {
    return this.coupons.getAutomaticDiscount(id);
  }

  @Patch('automatic-discounts/:id')
  updateDiscount(
    @Param('id') id: string,
    @Body() dto: UpdateAutomaticDiscountDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.updateAutomaticDiscount(id, dto, actorId);
  }

  @Delete('automatic-discounts/:id')
  removeDiscount(
    @Param('id') id: string,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.deleteAutomaticDiscount(id, actorId);
  }

  // ── Product sales ────────────────────────────────────────────────────────

  /**
   * Run one sale across a scope (all active products, a category subtree, or a
   * hand-picked set). Declared before `products/:id/sale` so "sales" is never
   * parsed as a product id.
   */
  @Post('sales/bulk')
  bulkSale(@Body() dto: BulkSaleDto, @CurrentUser('userId') actorId: number) {
    return this.coupons.applyBulkSale(dto, actorId);
  }

  /** How many products/variants a given scope would touch. Read-only. */
  @Post('sales/preview')
  previewBulkSale(@Body() dto: BulkSaleDto) {
    return this.coupons.previewBulkSale(dto);
  }

  @Put('products/:id/sale')
  setSale(
    @Param('id') id: string,
    @Body() dto: SetSalePriceDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.setSalePrice(id, dto, actorId);
  }

  @Delete('products/:id/sale')
  clearSale(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.coupons.clearSalePrice(id, actorId);
  }
}
