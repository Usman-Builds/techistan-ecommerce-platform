import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { cldUrl } from '../media/media.util';
import { UpdateSettingsDto } from './dto/update-settings.dto';

/**
 * Storefront-safe projection of the store settings singleton (script 14). Only
 * public fields are exposed here — `taxRules` and internal shipping-zone math
 * stay server-side (they are read by the pricing/cart services, never shipped to
 * the browser).
 */
export interface PublicStoreSettings {
  name: string;
  currency: string;
  logoUrl: string | null;
  contactEmail: string | null;
  socials: Record<string, string> | null;
  /**
   * Announcement strip. Already resolved: `announcement` is null unless the
   * merchant both enabled it and wrote something, so the header renders it or
   * not without re-deriving the rule.
   */
  announcement: { text: string; href: string | null } | null;
  footerTagline: string | null;
  footerNote: string | null;
}

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private logoUrl(logoPublicId: string | null | undefined): string | null {
    const cloudName = this.config.get<string>('cloudinary.cloudName');
    return logoPublicId && cloudName
      ? cldUrl(cloudName, logoPublicId, { w: 240 })
      : null;
  }

  /** Public store settings for the storefront header/footer + currency. */
  async getPublicSettings(): Promise<PublicStoreSettings> {
    const setting = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
    });

    const announcementText = setting?.announcementText?.trim();
    return {
      name: setting?.name ?? 'Techistan',
      currency: setting?.currency ?? 'USD',
      logoUrl: this.logoUrl(setting?.logoPublicId),
      contactEmail: setting?.contactEmail ?? null,
      socials: (setting?.socials as Record<string, string> | null) ?? null,
      announcement:
        setting?.announcementEnabled && announcementText
          ? { text: announcementText, href: setting.announcementHref ?? null }
          : null,
      footerTagline: setting?.footerTagline ?? null,
      footerNote: setting?.footerNote ?? null,
    };
  }

  /**
   * Ensure the singleton row exists and return it. The row is created lazily the
   * first time the admin opens settings (or on first update), so a fresh install
   * has no seed dependency.
   */
  private async ensureSingleton() {
    const existing = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
    });
    if (existing) return existing;
    return this.prisma.storeSetting.create({ data: { singleton: true } });
  }

  /** Full store settings record for the admin editor (script 15, FR-810). */
  async getAdminSettings() {
    const setting = await this.ensureSingleton();
    return { ...setting, logoUrl: this.logoUrl(setting.logoPublicId) };
  }

  /** Patch the store settings singleton; audited. */
  async updateSettings(dto: UpdateSettingsDto, actorId?: number) {
    await this.ensureSingleton();

    const data: Prisma.StoreSettingUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.logoPublicId !== undefined) data.logoPublicId = dto.logoPublicId;
    if (dto.contactEmail !== undefined) data.contactEmail = dto.contactEmail;
    if (dto.currency !== undefined) data.currency = dto.currency.toUpperCase();
    if (dto.lowStockThreshold !== undefined)
      data.lowStockThreshold = dto.lowStockThreshold;
    if (dto.announcementText !== undefined)
      data.announcementText = dto.announcementText;
    if (dto.announcementHref !== undefined)
      data.announcementHref = dto.announcementHref;
    if (dto.announcementEnabled !== undefined)
      data.announcementEnabled = dto.announcementEnabled;
    if (dto.footerTagline !== undefined) data.footerTagline = dto.footerTagline;
    if (dto.footerNote !== undefined) data.footerNote = dto.footerNote;
    // Nullable JSON columns: an explicit null must map to Prisma.JsonNull; a
    // plain object satisfies InputJsonValue (cast past the readonly-array union).
    if (dto.taxRules !== undefined)
      data.taxRules =
        dto.taxRules === null
          ? Prisma.JsonNull
          : (dto.taxRules as Prisma.InputJsonValue);
    if (dto.shippingZones !== undefined)
      data.shippingZones =
        dto.shippingZones === null
          ? Prisma.JsonNull
          : (dto.shippingZones as Prisma.InputJsonValue);
    if (dto.socials !== undefined)
      data.socials =
        dto.socials === null
          ? Prisma.JsonNull
          : (dto.socials as Prisma.InputJsonValue);

    const updated = await this.prisma.storeSetting.update({
      where: { singleton: true },
      data,
    });

    await this.audit.record({
      actorId: actorId ?? null,
      action: 'settings.update',
      entityType: 'StoreSetting',
      entityId: updated.id,
      metadata: { fields: Object.keys(data) },
    });

    return { ...updated, logoUrl: this.logoUrl(updated.logoPublicId) };
  }
}
