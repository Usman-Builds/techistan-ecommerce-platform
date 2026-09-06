import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
  ValidateNested,
} from 'class-validator';
import { HomeSectionType } from '@prisma/client';

/** Guard against a runaway reorder payload. */
export const MAX_REORDER_ITEMS = 200;

/**
 * Per-type extras for a homepage section.
 *
 * Validated loosely on purpose: the meaningful keys differ per section type
 * (a PRODUCT_RAIL wants source/categoryId/limit, a BANNER wants artwork and a
 * CTA), and encoding that as a discriminated union of seven DTOs would be a lot
 * of ceremony for an admin-only, admin-authored payload. The renderer treats
 * every key as optional and falls back, so a malformed config degrades to a
 * default section rather than a broken page.
 */
export class HomepageSectionConfigDto {
  /** PRODUCT_RAIL: where products come from. */
  @IsOptional()
  @IsString()
  source?: string;

  /** PRODUCT_RAIL (source=CATEGORY) / CATEGORY_RAIL: which category. */
  @IsOptional()
  @IsString()
  categoryId?: string;

  /** PRODUCT_RAIL (source=TAG). */
  @IsOptional()
  @IsString()
  tag?: string;

  /** PRODUCT_RAIL (source=PRICE_UNDER), integer cents. */
  @IsOptional()
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** How many cards the rail shows. */
  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  /** Lucide icon name for the section heading. */
  @IsOptional()
  @IsString()
  icon?: string;

  /** BANNER artwork. */
  @IsOptional()
  @IsString()
  imageId?: string;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  /** BANNER call-to-action. */
  @IsOptional()
  @IsString()
  ctaLabel?: string;

  /** CATEGORY_RAIL / CATEGORY_GRID: show only categories flagged `featured`. */
  @IsOptional()
  @IsBoolean()
  featuredOnly?: boolean;

  /**
   * SPOTLIGHT: which product to feature.
   *
   * A SLUG rather than an id, because the storefront fetches the spotlight
   * through the same public `/products/:slug` route a shopper would, so a
   * product that is drafted or deleted degrades to "no spotlight" through the
   * ordinary 404 path instead of needing its own existence check here.
   *
   * Left blank the block picks the best-rated featured product itself, which is
   * what makes it usable on a store nobody has curated yet.
   */
  @IsOptional()
  @IsString()
  productSlug?: string;

  /** SPOTLIGHT: label on the secondary link beside the main CTA. */
  @IsOptional()
  @IsString()
  secondaryLabel?: string;

  /** SPOTLIGHT: where that secondary link goes. */
  @IsOptional()
  @IsString()
  secondaryHref?: string;
}

export class CreateHomepageSectionDto {
  @IsEnum(HomeSectionType)
  type!: HomeSectionType;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  eyebrow?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 320)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  href?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  linkLabel?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => HomepageSectionConfigDto)
  config?: HomepageSectionConfigDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** All-optional patch. Same fields, `type` included (a rail can become a grid). */
export class UpdateHomepageSectionDto {
  @IsOptional()
  @IsEnum(HomeSectionType)
  type?: HomeSectionType;

  @IsOptional()
  @IsString()
  @Length(0, 80)
  eyebrow?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 160)
  title?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 320)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  href?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  linkLabel?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => HomepageSectionConfigDto)
  config?: HomepageSectionConfigDto | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateHeroSlideDto {
  @IsOptional()
  @IsString()
  @Length(0, 80)
  eyebrow?: string | null;

  @IsString()
  @Length(1, 160)
  title!: string;

  @IsOptional()
  @IsString()
  @Length(0, 320)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  ctaHref?: string | null;

  @IsOptional()
  @IsString()
  imageId?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  /** Campaign window. Outside it the slide is skipped without being disabled. */
  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

export class UpdateHeroSlideDto {
  @IsOptional()
  @IsString()
  @Length(0, 80)
  eyebrow?: string | null;

  @IsOptional()
  @IsString()
  @Length(1, 160)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 320)
  subtitle?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 60)
  ctaLabel?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  ctaHref?: string | null;

  @IsOptional()
  @IsString()
  imageId?: string | null;

  @IsOptional()
  @IsString()
  imageUrl?: string | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsISO8601()
  startsAt?: string | null;

  @IsOptional()
  @IsISO8601()
  endsAt?: string | null;
}

/** One row of a reorder payload. */
export class ReorderItemDto {
  @IsString()
  id!: string;

  @IsInt()
  @Min(0)
  sortOrder!: number;
}

/**
 * Batch reorder. The client sends the WHOLE list in its new order rather than a
 * pair of swapped ids, so the server never has to reconstruct intent from a
 * delta and a dropped request can't leave a half-applied ordering.
 */
export class ReorderDto {
  @IsArray()
  @ArrayMaxSize(MAX_REORDER_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => ReorderItemDto)
  items!: ReorderItemDto[];
}
