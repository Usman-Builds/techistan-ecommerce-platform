import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';

/**
 * Admin store-settings update (script 15, FR-810). All fields optional (PATCH
 * semantics). `taxRules` / `shippingZones` / `socials` are free-form JSON objects
 * validated only as objects here — their internal shape is interpreted by the
 * pricing service. Currency changes reflect on the storefront (shared settings).
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

  @IsOptional()
  @IsObject()
  shippingZones?: Record<string, unknown> | null;

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
