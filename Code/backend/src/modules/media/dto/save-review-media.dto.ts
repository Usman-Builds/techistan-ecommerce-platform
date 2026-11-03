import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

/**
 * Body for `POST /reviews/media` (#33): confirm a customer's direct-to-Cloudinary
 * review photo upload. Only the reference is accepted; format, size and
 * dimensions come from Cloudinary itself, and the folder is fixed server-side.
 */
export class SaveReviewMediaDto {
  @IsString()
  @MaxLength(255)
  cloudinaryPublicId!: string;

  @IsUrl({ require_protocol: true })
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  alt?: string;
}
