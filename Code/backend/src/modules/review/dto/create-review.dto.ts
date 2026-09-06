import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * Submit a product review (FR-701). `productId` and `mediaIds` are cuids (the
 * project uses cuid ids, not UUIDs — cf. `00 §9`), so they are validated as
 * non-empty strings. `mediaIds` reference MediaAsset rows already uploaded via
 * the script-06 Cloudinary signed-upload flow; the service caps them at 3.
 */
export class CreateReviewDto {
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  @IsString({ each: true })
  mediaIds?: string[];
}
