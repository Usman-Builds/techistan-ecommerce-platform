import { IsOptional, IsString, MaxLength } from 'class-validator';

/** SEO-only patch (`PATCH /admin/products/:id/seo`). */
export class UpdateSeoDto {
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
