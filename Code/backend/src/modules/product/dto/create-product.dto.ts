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
 * Create-product payload. Slug is derived from the title when omitted (Task 7).
 * `axes` (≤3) name the option dimensions; if omitted they're inferred from the
 * variants' `options` keys. The ≤3-axes / ≤100-combination rules are enforced
 * authoritatively in `product.service.ts` (`validateVariantMatrix`) — the array
 * caps here are just an abuse backstop.
 */
export class CreateProductDto {
  @IsString()
  @MaxLength(300)
  title!: string;

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
  categoryId?: string;

  @IsOptional()
  @IsString()
  brandId?: string;

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

  // ── SEO ──
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
