import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MAX_IMAGES } from './product.constants';

/** One image row in the ordered set persisted by `PUT /admin/products/:id/images`. */
export class ProductImageInputDto {
  /** Cloudinary public_id (from the MediaUploader / script 06). */
  @IsString()
  @MaxLength(300)
  publicId!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;

  @IsInt()
  @Min(0)
  position!: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;
}

export class SetImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductImageInputDto)
  @ArrayMaxSize(MAX_IMAGES)
  images!: ProductImageInputDto[];
}
