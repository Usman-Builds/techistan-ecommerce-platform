import { CouponType } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { PromotionScopeDto } from './promotion-scope.dto';

/**
 * Create a coupon (FR-601). `value` is a whole percent (0–100) for PERCENT, or a
 * fixed amount in **cents** for FIXED; it is ignored for FREE_SHIPPING. All money
 * fields are integer cents (`00 §9`). Dates are ISO-8601 strings.
 *
 * Extends {@link PromotionScopeDto}, so a coupon can be restricted to specific
 * products or a category subtree — see that class for the scoping contract.
 */
export class CreateCouponDto extends PromotionScopeDto {
  @IsString()
  @Length(2, 40)
  code!: string;

  /** Merchant-facing label, e.g. "Summer sale — audio". */
  @IsOptional()
  @IsString()
  @Length(0, 120)
  name?: string;

  /** Shopper-facing blurb, shown on the offers strip when `isPublic`. */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @IsInt()
  @Min(0)
  value!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrder?: number;

  /** Cap (cents) on a PERCENT coupon's computed discount. */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxDiscount?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  usageLimit?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  perCustomerLimit?: number;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  /** Advertise on the storefront offers strip. Off by default. */
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
