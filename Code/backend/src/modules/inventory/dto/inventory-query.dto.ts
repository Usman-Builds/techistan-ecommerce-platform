import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';

/** Stock band a variant falls into. */
export enum InventoryStockFilter {
  IN = 'in',
  LOW = 'low',
  OUT = 'out',
}

/** Column the inventory list is ordered by. */
export enum InventorySort {
  STOCK_ASC = 'stock_asc',
  STOCK_DESC = 'stock_desc',
  SKU_ASC = 'sku_asc',
  TITLE_ASC = 'title_asc',
  PRICE_ASC = 'price_asc',
  PRICE_DESC = 'price_desc',
  VALUE_DESC = 'value_desc',
}

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 1 || value === '1'
    ? true
    : value === false || value === 'false' || value === 0 || value === '0'
      ? false
      : value;

/**
 * Admin inventory-list filters (script 15 FR-805, extended in script 18).
 *
 * The original screen could only search text and toggle "low stock only",
 * which is unusable once a catalog has a few hundred variants: the question an
 * admin actually asks is "what is running out in Laptops?", and that needs the
 * category, status and stock-band filters below.
 */
export class InventoryQueryDto {
  /** Case-insensitive contains over SKU or product title. */
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Kept for backwards compatibility with the pre-script-18 UI and any saved
   * links. Equivalent to `stock=low`; `stock` wins if both are sent.
   */
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  lowStockOnly?: boolean;

  /** Stock band — see {@link InventoryStockFilter}. */
  @IsOptional()
  @IsEnum(InventoryStockFilter)
  stock?: InventoryStockFilter;

  /** Category filter, matched against the category AND its descendants. */
  @IsOptional()
  @IsString()
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

  /** Filter by the OWNING PRODUCT's status (variants have no status). */
  @IsOptional()
  @IsEnum(ProductStatus)
  productStatus?: ProductStatus;

  /** Inclusive stock bounds, for ad-hoc bands the presets don't cover. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minStock?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxStock?: number;

  @IsOptional()
  @IsEnum(InventorySort)
  sort?: InventorySort;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
