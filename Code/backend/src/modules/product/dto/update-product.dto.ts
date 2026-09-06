import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ProductStatus } from '@prisma/client';
import { VariantInputDto } from './variant.dto';

/**
 * Update payload — every field optional (manual `PartialType` of
 * `CreateProductDto`; `@nestjs/mapped-types` isn't a dependency here).
 *
 * Semantics: providing `slug` renames it (re-uniqued); omitting it keeps the
 * existing slug even if the title changes (avoids breaking existing URLs).
 * Providing `variants` replaces the whole variant set (re-validated); omitting
 * it leaves variants untouched. Same for `tagIds`.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(220)
  slug?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @IsOptional()
  @IsString()
  categoryId?: string | null;

  @IsOptional()
  @IsString()
  brandId?: string | null;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(50)
  tagIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3)
  axes?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VariantInputDto)
  @ArrayMaxSize(300)
  variants?: VariantInputDto[];

  @IsOptional()
  @IsString()
  @MaxLength(180)
  metaTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  metaDescription?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ogImage?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  canonicalUrl?: string;
}
