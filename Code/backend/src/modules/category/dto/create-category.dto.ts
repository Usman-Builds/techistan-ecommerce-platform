import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

/** Coerce "true"/"false"/1/0 from multipart or query-ish payloads. */
const toBool = ({ value }: { value: unknown }) =>
  value === true || value === 'true' || value === 1 || value === '1'
    ? true
    : value === false || value === 'false' || value === 0 || value === '0'
      ? false
      : value;

/**
 * Create a category (script 18).
 *
 * A category is a landing page, not just a label, so this carries three groups
 * of fields beyond name/slug/parent: PRESENTATION (description, poster image,
 * wide banner, icon), SEO (meta title/description), and VISIBILITY (isActive,
 * showInNav, featured). All of them are optional — a category created with a
 * name alone still works and simply falls back to the storefront defaults.
 */
export class CreateCategoryDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  slug?: string;

  /** Parent category id; null/omitted → a root category. Depth ≤ 3 enforced. */
  @IsOptional()
  @IsString()
  parentId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;

  // ── Presentation ──────────────────────────────────────────────────────────

  /** Merchandising copy shown above the product grid. */
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  /** Cloudinary public_id + url for the square/portrait poster image. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  imageId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string | null;

  /** Wide cover art for the category page header. */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  bannerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bannerUrl?: string | null;

  /** Lucide icon name, e.g. "Laptop". Overrides the storefront heuristic. */
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
