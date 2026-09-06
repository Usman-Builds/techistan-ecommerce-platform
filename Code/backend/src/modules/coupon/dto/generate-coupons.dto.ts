import { CouponType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { PromotionScopeDto } from './promotion-scope.dto';

/** Hard ceiling on one generation run. */
export const MAX_GENERATED_COUPONS = 500;

/**
 * Mint a batch of unique coupon codes that share one set of rules (script 18).
 *
 * Everything below the code-shape fields mirrors {@link CreateCouponDto},
 * because a generated coupon IS a coupon — the only difference is that the code
 * is machine-chosen and the whole run shares a `batchId`.
 *
 * `usageLimit` / `perCustomerLimit` default to 1 in the service: a batch of
 * unique codes exists precisely so each shopper gets their own single-use code.
 */
export class GenerateCouponsDto extends PromotionScopeDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_GENERATED_COUPONS)
  count!: number;

  /**
   * Optional leading segment, e.g. "WELCOME" → "WELCOME-K7M2QX4P". Letters,
   * digits, underscore and dash only, so a code is always URL- and CSV-safe.
   */
  @IsOptional()
  @IsString()
  @Length(0, 20)
  @Matches(/^[A-Za-z0-9_-]*$/, {
    message: 'prefix may only contain letters, numbers, dashes and underscores',
  })
  prefix?: string;

  /** Character between the prefix and the random part. Default "-". */
  @IsOptional()
  @IsIn(['-', '_', ''])
  separator?: string;

  /** Length of the random part. 6–12; longer means fewer collisions. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(6)
  @Max(12)
  suffixLength?: number;

  // ── Shared coupon rules ──────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @Length(0, 120)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsEnum(CouponType)
  type!: CouponType;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  value!: number;

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
}

/**
 * Act on many coupons at once — either a hand-picked selection (`ids`) or an
 * entire generated run (`batchId`). Exactly one addressing mode is used;
 * `batchId` wins if both are sent.
 */
export class BulkCouponDto {
  @IsIn(['activate', 'deactivate', 'delete'])
  action!: 'activate' | 'deactivate' | 'delete';

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GENERATED_COUPONS)
  @IsString({ each: true })
  ids?: string[];

  @IsOptional()
  @IsString()
  batchId?: string;
}
