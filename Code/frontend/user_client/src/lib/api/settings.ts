/**
 * Public store settings (script 14). Drives the storefront name/logo, display
 * currency, contact email, and social links in the header/footer. Server reads
 * fall back to sane defaults so the chrome always renders.
 */
import { apiClient } from "./client";
import { serverGet } from "@/lib/server/api";

export interface StoreSettings {
  name: string;
  currency: string;
  logoUrl: string | null;
  contactEmail: string | null;
  socials: Record<string, string> | null;
  /**
   * Announcement strip, already resolved by the API: null unless the merchant
   * both enabled it AND wrote something, so the header renders it or not
   * without re-deriving that rule.
   */
  announcement: { text: string; href: string | null } | null;
  /** Blurb under the logo in the footer. Null falls back to the built-in copy. */
  footerTagline: string | null;
  /** Overrides the default copyright line. */
  footerNote: string | null;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  name: "Techistan",
  currency: "USD",
  logoUrl: null,
  contactEmail: null,
  socials: null,
  announcement: null,
  footerTagline: null,
  footerNote: null,
};

export function getSettings(): Promise<StoreSettings> {
  return apiClient.get<StoreSettings>("/settings");
}

/** SSR read with a guaranteed value (defaults on any failure). */
export async function getSettingsServer(): Promise<StoreSettings> {
  return (await serverGet<StoreSettings>("/settings")) ?? DEFAULT_SETTINGS;
}
