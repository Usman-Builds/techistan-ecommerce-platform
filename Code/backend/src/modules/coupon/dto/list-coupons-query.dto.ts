import { Transform } from 'class-transformer';
import {
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CouponType, PromotionScope } from '@prisma/client';

/** Lifecycle buckets a coupon list can be narrowed to. */
export type CouponStatusFilter =
  | 'active'
  | 'inactive'
  | 'expired'
  | 'scheduled';

/**
 * Admin coupon-list filters + pagination (FR-806, extended in script 18).
 *
 * `status` covers the two flag states plus the two time-derived ones, because
 * "why is this code not working" is nearly always an expiry or a start date
 * rather than the active flag.
 */
export class ListCouponsQueryDto {
  /** Case-insensitive contains over code AND name. */
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['active', 'inactive', 'expired', 'scheduled'])
  status?: CouponStatusFilter;

  /** Restrict to unrestricted / category-scoped / product-scoped coupons. */
  @IsOptional()
  @IsEnum(PromotionScope)
  scope?: PromotionScope;

  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  /** One generated run, by its batch id. */
  @IsOptional()
  @IsString()
  batchId?: string;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Transform(({ value }) => parseInt(value as string, 10))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
