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
 * Partial coupon edit (FR-806). Every field is optional; `code` is still length-
 * validated when present. The service re-checks code uniqueness on change.
 *
 * Scope fields come from {@link PromotionScopeDto}. Sending `productIds` or
 * `categoryIds` REPLACES the existing targets; omitting them leaves the current
 * ones untouched.
 */
export class UpdateCouponDto extends PromotionScopeDto {
  @IsOptional()
  @IsString()
  @Length(2, 40)
  code?: string;

  @IsOptional()
  @IsString()
  @Length(0, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsOptional()
  @IsEnum(CouponType)
  type?: CouponType;

  @IsOptional()
  @IsInt()
  @Min(0)
  value?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  minOrder?: number;

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

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
