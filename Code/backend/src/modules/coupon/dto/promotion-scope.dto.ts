import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';
import { PromotionScope } from '@prisma/client';

/**
 * Upper bound on hand-picked targets. Beyond this a merchant wants a category
 * rule, not a list of ids — and an unbounded array is a request-size and
 * query-planner hazard.
 */
export const MAX_SCOPE_TARGETS = 200;

/**
 * The restriction half of every promotion (coupon, automatic discount, bulk
 * sale), factored into one base class.
 *
 * Coupons, automatic discounts and sales all answer the same question — "what
 * does this apply to?" — so they take the same four fields and the same
 * validation. Stating it once means the three can never drift into three
 * slightly different vocabularies for the same idea, which is exactly what
 * makes a promotions system confusing to operate.
 *
 * `productIds` / `categoryIds` are ignored unless `scope` selects them, and are
 * REPLACED wholesale on update (the editor always submits the full list).
 */
export class PromotionScopeDto {
  @IsOptional()
  @IsEnum(PromotionScope)
  scope?: PromotionScope;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_TARGETS)
  @IsString({ each: true })
  productIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_SCOPE_TARGETS)
  @IsString({ each: true })
  categoryIds?: string[];

  /**
   * When false, lines already on sale drop out of the eligible subtotal — the
   * usual "cannot be combined with other offers" rule.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    value === true || value === 'true'
      ? true
      : value === false || value === 'false'
        ? false
        : value,
  )
  @IsBoolean()
  appliesToSaleItems?: boolean;
}
