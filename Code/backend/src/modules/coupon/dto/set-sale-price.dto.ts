import {
  IsBoolean,
  IsInt,
  IsISO8601,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { PromotionScopeDto } from './promotion-scope.dto';

/**
 * Set (or update) a scheduled sale on every variant of a product (FR-604). Supply
 * exactly one of `percentOff` (whole %, applied to each variant's regular price)
 * or `salePriceCents` (a flat sale price for all variants — best for a single-
 * variant product). Omit both to clear the sale. Money is integer cents.
 */
export class SetSalePriceDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number;

  @ValidateIf((o: SetSalePriceDto) => o.percentOff == null)
  @IsOptional()
  @IsInt()
  @Min(0)
  salePriceCents?: number;

  @IsOptional()
  @IsISO8601()
  saleStartsAt?: string;

  @IsOptional()
  @IsISO8601()
  saleEndsAt?: string;
}

/**
 * Run one sale across many products at once (script 18).
 *
 * Uses the same scope vocabulary as coupons and automatic discounts — ALL
 * (every ACTIVE product), CATEGORY (a subtree), or PRODUCT (a hand-picked set)
 * — so "20% off laptops this weekend" is one call rather than one call per
 * product.
 *
 * `percentOff` derives each variant's sale price from its OWN regular price and
 * is what a seasonal sale almost always wants. `salePriceCents` flattens every
 * matched variant to the same price and only makes sense for a small,
 * hand-picked set.
 */
export class BulkSaleDto extends PromotionScopeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  percentOff?: number;

  @ValidateIf((o: BulkSaleDto) => o.percentOff == null)
  @IsOptional()
  @IsInt()
  @Min(0)
  salePriceCents?: number;

  @IsOptional()
  @IsISO8601()
  saleStartsAt?: string;

  @IsOptional()
  @IsISO8601()
  saleEndsAt?: string;

  /**
   * Explicitly END the sale on everything in scope. Distinct from "sent no
   * price", so the UI can offer a deliberate "clear sale" action instead of
   * relying on an empty form meaning something destructive.
   */
  @IsOptional()
  @IsBoolean()
  clear?: boolean;
}
