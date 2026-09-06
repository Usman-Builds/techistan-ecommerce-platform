import { DiscountStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { PromotionScopeDto } from './promotion-scope.dto';

/**
 * The JSON condition for an automatic (no-code) cart discount (FR-603). Supported
 * shapes (all fields optional; the discount applies when the gates are met):
 *  - `minSubtotal` (cents): cart subtotal must reach this.
 *  - `minQty`: total purchasable item count must reach this ("Buy 3 …").
 *  - `percentOff` (0–100) OR `amountOff` (cents): the discount to apply.
 *  - `freeShipping`: waive shipping.
 */
export class AutomaticDiscountRuleDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  minSubtotal?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  minQty?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  percentOff?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  amountOff?: number;

  @IsOptional()
  @IsBoolean()
  freeShipping?: boolean;
}

/**
 * An automatic discount is a coupon without a code, so it takes the same
 * restriction fields — see {@link PromotionScopeDto}. The rule's `minSubtotal`
 * / `minQty` gates are still evaluated against the WHOLE cart; only the money
 * discounted is narrowed by the scope.
 */
export class CreateAutomaticDiscountDto extends PromotionScopeDto {
  @IsString()
  @Length(2, 80)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @ValidateNested()
  @Type(() => AutomaticDiscountRuleDto)
  rule!: AutomaticDiscountRuleDto;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(DiscountStatus)
  status?: DiscountStatus;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}

export class UpdateAutomaticDiscountDto extends PromotionScopeDto {
  @IsOptional()
  @IsString()
  @Length(2, 80)
  name?: string;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  description?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AutomaticDiscountRuleDto)
  rule?: AutomaticDiscountRuleDto;

  @IsOptional()
  @IsInt()
  priority?: number;

  @IsOptional()
  @IsEnum(DiscountStatus)
  status?: DiscountStatus;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;
}
