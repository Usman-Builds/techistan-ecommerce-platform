import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { AdminOnly, CurrentUser } from '../../common';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { ListCouponsQueryDto } from './dto/list-coupons-query.dto';
import { BulkCouponDto, GenerateCouponsDto } from './dto/generate-coupons.dto';

/**
 * Admin coupon management (FR-806). `@AdminOnly()` layers JwtAuthGuard +
 * RolesGuard (ADMIN | SUPER_ADMIN) — RBAC is enforced server-side (NFR-208),
 * never client-only. Every mutation writes an AuditLog in the service and a
 * duplicate `code` returns 409.
 */
@AdminOnly()
@Controller('admin/coupons')
export class CouponAdminController {
  constructor(private readonly coupons: CouponService) {}

  @Post()
  create(@Body() dto: CreateCouponDto, @CurrentUser('userId') actorId: number) {
    return this.coupons.createCoupon(dto, actorId);
  }

  /** Mint a batch of unique single-use codes sharing one set of rules. */
  @Post('generate')
  generate(
    @Body() dto: GenerateCouponsDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.generateCoupons(dto, actorId);
  }

  /** Activate / deactivate / delete a selection or a whole generated batch. */
  @Post('bulk')
  bulk(@Body() dto: BulkCouponDto, @CurrentUser('userId') actorId: number) {
    return this.coupons.bulkCouponAction(dto, actorId);
  }

  @Get()
  list(@Query() query: ListCouponsQueryDto) {
    return this.coupons.listCoupons(query);
  }

  /**
   * Generated batches, for the batch filter. Declared before `:id` so the
   * literal segment is never swallowed by the param route.
   */
  @Get('batches')
  batches() {
    return this.coupons.listCouponBatches();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.coupons.getCoupon(id);
  }

  @Get(':id/redemptions')
  redemptions(@Param('id') id: string) {
    return this.coupons.getRedemptions(id);
  }

  @Get(':id/analytics')
  analytics(@Param('id') id: string) {
    return this.coupons.getCouponAnalytics(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCouponDto,
    @CurrentUser('userId') actorId: number,
  ) {
    return this.coupons.updateCoupon(id, dto, actorId);
  }

  @Patch(':id/toggle')
  toggle(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.coupons.toggleCoupon(id, actorId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') actorId: number) {
    return this.coupons.deleteCoupon(id, actorId);
  }
}
