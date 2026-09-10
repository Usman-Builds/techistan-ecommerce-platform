/**
 * Admin store-settings API (script 15, FR-810). Reads/writes the FULL StoreSetting
 * record (incl. taxRules/shippingZones/threshold), unlike the public projection.
 * Currency/logo changes reflect on the storefront (shared settings source).
 */
import { apiClient } from "./client";

export interface StoreSettings {
  id: string;
  name: string;
  logoPublicId: string | null;
  logoUrl: string | null;
  contactEmail: string | null;
  currency: string;
  taxRules: Record<string, unknown> | null;
  shippingZones: Record<string, unknown> | null;
  socials: Record<string, string> | null;
  lowStockThreshold: number;
  // Storefront chrome (script 18) — header strip + footer copy.
  announcementText: string | null;
  announcementHref: string | null;
  announcementEnabled: boolean;
  footerTagline: string | null;
  footerNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateSettingsInput {
  name?: string;
  logoPublicId?: string | null;
  contactEmail?: string | null;
  currency?: string;
  taxRules?: Record<string, unknown> | null;
  shippingZones?: Record<string, unknown> | null;
  socials?: Record<string, string> | null;
  lowStockThreshold?: number;
  announcementText?: string | null;
  announcementHref?: string | null;
  announcementEnabled?: boolean;
  footerTagline?: string | null;
  footerNote?: string | null;
}

export function getAdminSettings(): Promise<StoreSettings> {
  return apiClient.get<StoreSettings>("/admin/settings");
}

export function updateSettings(input: UpdateSettingsInput): Promise<StoreSettings> {
  return apiClient.patch<StoreSettings>("/admin/settings", input);
}
