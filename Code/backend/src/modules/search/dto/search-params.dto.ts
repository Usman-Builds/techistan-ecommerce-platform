import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProductSort } from '../../product/dto/list-products.dto';

/** Max results per page for search (bounds the query). */
export const MAX_SEARCH_PAGE_SIZE = 60;

/** Coerce a single query-string value or repeated values into a string[]. */
const toStringArray = ({ value }: { value: unknown }): string[] | undefined => {
  if (value == null) return undefined;
  const arr = Array.isArray(value) ? value : [value];
  return arr.map((v) => String(v)).filter((v) => v.length > 0);
};

/** Coerce common truthy query strings into a boolean. */
const toBoolean = ({ value }: { value: unknown }): boolean | undefined => {
  if (value == null || value === '') return undefined;
  return value === true || value === 'true' || value === '1';
};

/**
 * Query params for `GET /search` and `GET /search/facets` (script 08). Filters
 * are composable with the text query and with each other; prices are integer
 * cents. Multi-value facets (category, brand) accept repeated params
 * (`?category=a&category=b`) or a single value.
 */
export class SearchParamsDto {
  @IsOptional()
  @IsString()
  q?: string;

  /** Category slugs (multi-select). */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  category?: string[];

  /** Brand slugs (multi-select). */
  @IsOptional()
  @Transform(toStringArray)
  @IsArray()
  @IsString({ each: true })
  brand?: string[];

  /** Minimum variant price, integer cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  /** Maximum variant price, integer cents. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  /** Minimum average rating (1–5), e.g. 4 = "4 stars & up". */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  /** Only products with at least one in-stock variant. */
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  inStock?: boolean;

  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_SEARCH_PAGE_SIZE)
  pageSize: number = 24;
}
