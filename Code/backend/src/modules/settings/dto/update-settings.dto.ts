import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * One shipping zone, in the exact shape the pricing and cart services read
 * (#34). A zone matches when the destination country is in `countries`; a zone
 * with no countries is the catch-all. `freeOverCents` waives the fee once the
 * subtotal reaches it.
 */
export class ShippingZoneDto {
  @IsString()
  @Length(1, 60)
  label!: string;

  @IsInt()
  @Min(0)
  rateCents!: number;

  /** ISO 3166-1 alpha-2 codes, e.g. ["US", "CA"]. Omit for "everywhere else". */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(250)
  @Matches(/^[A-Za-z]{2}$/, {
    each: true,
    message: 'countries must be 2-letter ISO country codes',
  })
  countries?: string[];

  @IsOptional()
  @IsInt()
  @Min(0)
  freeOverCents?: number;
}

/**
 * Admin store-settings update (script 15, FR-810). All fields optional (PATCH
 * semantics). `taxRules` / `socials` are free-form JSON objects validated only
 * as objects here; `shippingZones` is validated zone by zone (see
 * {@link ShippingZoneDto}) because pricing only understands that shape. Currency changes reflect on the storefront (shared settings).
 */
export class UpdateSettingsDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsString()
  logoPublicId?: string | null;

  @IsOptional()
  @IsEmail()
  contactEmail?: string | null;

  /** ISO 4217 code, e.g. "USD". */
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @IsOptional()
  @IsObject()
  taxRules?: Record<string, unknown> | null;

  /** Ordered list of zones; the first country match wins (#34). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShippingZoneDto)
  shippingZones?: ShippingZoneDto[] | null;

  @IsOptional()
  @IsObject()
  socials?: Record<string, string> | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  // ── Storefront chrome (script 18) ──────────────────────────────────────────
  // Header/footer copy that is store data, not code. Lives on settings rather
  // than in NavItem because none of it is a link.

  /** Thin strip above the header. Hidden unless enabled AND non-empty. */
  @IsOptional()
  @IsString()
  @Length(0, 200)
  announcementText?: string | null;

  @IsOptional()
  @IsString()
  @Length(0, 300)
  announcementHref?: string | null;

  @IsOptional()
  @IsBoolean()
  announcementEnabled?: boolean;

  /** Blurb under the logo in the footer's first column. */
  @IsOptional()
  @IsString()
  @Length(0, 300)
  footerTagline?: string | null;

  /** Overrides the default copyright line. */
  @IsOptional()
  @IsString()
  @Length(0, 200)
  footerNote?: string | null;
}
