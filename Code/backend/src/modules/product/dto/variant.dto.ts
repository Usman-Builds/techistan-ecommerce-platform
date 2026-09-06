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
 * All money is integer cents; floats/decimals are rejected by `@IsInt`.
 */
export class VariantInputDto {
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
