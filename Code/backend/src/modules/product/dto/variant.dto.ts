import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * One variant in a create/update payload. `options` maps each declared axis to a
 * value, e.g. `{ "Size": "M", "Color": "Red" }`. `sku` is optional — the service
 * auto-generates a unique one when omitted (and suffixes on collision).
 *
 * On update, an existing variant is matched by `id` when given, otherwise by its
 * option combination, and updated in place (#27); unmatched inputs are created.
 *
 * All money is integer cents; floats/decimals are rejected by `@IsInt`.
 */
export class VariantInputDto {
  /** Existing variant to update (optional; matching by options also works). */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  sku?: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  compareAtPrice?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  barcode?: string;

  @IsObject()
  options!: Record<string, string>;
}
