import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

/** Sort options (FR-222). `relevance` needs a search term; falls back to newest. */
export enum ProductSort {
  RELEVANCE = 'relevance',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  NEWEST = 'newest',
  OLDEST = 'oldest',
  TITLE_ASC = 'title_asc',
  TITLE_DESC = 'title_desc',
  BEST_SELLING = 'best_selling',
  TOP_RATED = 'top_rated',
}

/**
 * Stock-level filter for the admin catalog (script 18).
 *
 * Evaluated against the product's VARIANTS: `out` means every variant is at
 * zero, `in` means at least one variant has stock. `low` uses the store's
 * configured low-stock threshold — the same number the inventory screen and the
 * dashboard alert use, so the three never disagree.
 */
export enum StockFilter {
  IN = 'in',
  LOW = 'low',
  OUT = 'out',
}

/** Max page size for the public listing (NFR — bound the query). */
export const MAX_PAGE_SIZE = 60;

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 1 || value === '1'
    ? true
    : value === false || value === 'false' || value === 0 || value === '0'
      ? false
      : value;

export class ListProductsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = 24;

  @IsOptional()
  @IsString()
  categorySlug?: string;

  /**
   * Category filter by id, used by the admin picker (which holds ids, not
   * slugs). Like `categorySlug`, it matches the category AND its descendants —
   * filtering to "Computers" and getting nothing because every product sits in
   * "Laptops" would be a bug, not a feature.
   */
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  @IsOptional()
  @IsString()
  tag?: string;

  /** Minimum variant price, in integer cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  /** Maximum variant price, in integer cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** Admin-only filter; ignored for public callers (they always see ACTIVE). */
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  /** Admin-only stock-level filter — see {@link StockFilter}. */
  @IsOptional()
  @IsEnum(StockFilter)
  stock?: StockFilter;

  /** Only products with a sale price scheduled (not necessarily live today). */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  onSale?: boolean;

  /** Only products with no category assigned — the "needs filing" bucket. */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  uncategorized?: boolean;

  /** Inclusive created-at window (ISO 8601). */
  @IsOptional()
  @IsISO8601()
  createdFrom?: string;

  @IsOptional()
  @IsISO8601()
  createdTo?: string;

  @IsOptional()
  @IsEnum(ProductSort)
  sort: ProductSort = ProductSort.NEWEST;

  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Curated homepage feed (script 14). When true, results are ordered by the
   * denormalized aggregate rating (then recency) rather than the `sort` param —
   * a "featured" heuristic that needs no schema change. Public/ACTIVE-only.
   */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  featured?: boolean;
}
