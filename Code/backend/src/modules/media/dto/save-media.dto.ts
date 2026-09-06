import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ALLOWED_FORMATS, MAX_UPLOAD_BYTES } from '../media.util';

/**
 * Body for `POST /media` — persist a confirmed direct-to-Cloudinary upload. The
 * service re-verifies the asset against the Cloudinary Admin API, so these
 * client-provided values are treated as hints; authoritative metadata wins.
 */
export class SaveMediaDto {
  @IsString()
  cloudinaryPublicId!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  height?: number;

  @IsOptional()
  @IsString()
  @IsIn([...ALLOWED_FORMATS], { message: 'Unsupported file format' })
  format?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_UPLOAD_BYTES, { message: 'File exceeds the maximum allowed size' })
  bytes?: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;

  @IsOptional()
  @IsString()
  folder?: string;

  /** When present, the asset is attached to this product as a ProductImage. */
  @IsOptional()
  @IsString()
  productId?: string;
}
