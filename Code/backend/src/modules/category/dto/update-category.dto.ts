import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 1 || value === '1'
    ? true
    : value === false || value === 'false' || value === 0 || value === '0'
      ? false
      : value;

/**
 * All-optional patch for a category (manual partial — this project does not
 * depend on `@nestjs/mapped-types`).
 *
 * Nullable fields accept an explicit `null` to CLEAR them, which is distinct
 * from omitting the key (leave unchanged). The service only writes keys that
 * were actually present, so both behaviours survive the round trip.
 */
export class UpdateCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  // ── Presentation ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  bannerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  iconKey?: string | null;

  // ── SEO ───────────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  @MaxLength(160)
  metaTitle?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(320)
  metaDescription?: string | null;

  // ── Visibility ────────────────────────────────────────────────────────────

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  showInNav?: boolean;

  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  featured?: boolean;
}
