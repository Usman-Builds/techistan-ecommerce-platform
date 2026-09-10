"use client";

import { useState } from "react";
import { Check, Loader2, Save } from "lucide-react";
import type { StoreSettings, UpdateSettingsInput } from "@/lib/api/settings";
import { useUpdateSettings } from "@/lib/api/hooks/settings";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApiError } from "@/lib/api/client";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "INR"];
const SOCIAL_KEYS = ["twitter", "facebook", "instagram", "youtube", "tiktok"] as const;

const inputClass =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const labelClass = "block text-sm font-medium";

function jsonToText(v: Record<string, unknown> | null): string {
  return v ? JSON.stringify(v, null, 2) : "";
}

export function SettingsForm({ initial }: { initial: StoreSettings }) {
  const update = useUpdateSettings();

  const [name, setName] = useState(initial.name);
  const [contactEmail, setContactEmail] = useState(initial.contactEmail ?? "");
  const [currency, setCurrency] = useState(initial.currency);
  const [logoPublicId, setLogoPublicId] = useState(initial.logoPublicId ?? "");
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(initial.lowStockThreshold),
  );
  const [socials, setSocials] = useState<Record<string, string>>(
    (initial.socials as Record<string, string>) ?? {},
  );
  const [taxRulesText, setTaxRulesText] = useState(jsonToText(initial.taxRules));
  const [shippingZonesText, setShippingZonesText] = useState(
    jsonToText(initial.shippingZones),
  );

  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const parseJson = (
    text: string,
    label: string,
  ): Record<string, unknown> | null => {
    const t = text.trim();
    if (t === "") return null;
    try {
      const parsed = JSON.parse(t);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        throw new Error("must be an object");
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new Error(`${label} is not valid JSON.`);
    }
  };

  const buildPayload = (): UpdateSettingsInput => {
    const threshold = parseInt(lowStockThreshold, 10);
    return {
      name: name.trim(),
      contactEmail: contactEmail.trim() || null,
      currency,
      logoPublicId: logoPublicId.trim() || null,
      lowStockThreshold: Number.isFinite(threshold) ? threshold : 0,
      socials:
        Object.keys(socials).length > 0
          ? Object.fromEntries(
              Object.entries(socials).filter(([, v]) => v.trim() !== ""),
            )
          : null,
      taxRules: parseJson(taxRulesText, "Tax rules"),
      shippingZones: parseJson(shippingZonesText, "Shipping zones"),
    };
  };

  // Currency / tax / shipping changes are "destructive" (affect live pricing +
  // the storefront) → confirm before applying.
  const sensitiveChanged =
    currency !== initial.currency ||
    taxRulesText.trim() !== jsonToText(initial.taxRules).trim() ||
    shippingZonesText.trim() !== jsonToText(initial.shippingZones).trim();

  const doSave = async () => {
    setError(null);
    setSaved(false);
    let payload: UpdateSettingsInput;
    try {
      payload = buildPayload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid input.");
      return;
    }
    if (!payload.name) {
      setError("Store name is required.");
      return;
    }
    try {
      await update.mutateAsync(payload);
      setSaved(true);
      setConfirmOpen(false);
      window.setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save settings.");
      setConfirmOpen(false);
    }
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Validate JSON early so confirm doesn't open on bad input.
    try {
      buildPayload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid input.");
      return;
    }
    if (sensitiveChanged) setConfirmOpen(true);
    else void doSave();
  };

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {/* Store details */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Store details</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Name, currency, and logo appear on the storefront.
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="name" className={labelClass}>
              Store name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="contactEmail" className={labelClass}>
              Contact email
            </label>
            <input
              id="contactEmail"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              className={inputClass}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="currency" className={labelClass}>
              Currency
            </label>
            <select
              id="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={inputClass}
            >
              {(CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES]).map(
                (c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="space-y-1">
            <label htmlFor="logo" className={labelClass}>
              Logo (Cloudinary public ID)
            </label>
            <input
              id="logo"
              value={logoPublicId}
              onChange={(e) => setLogoPublicId(e.target.value)}
              placeholder="techistan/store/logo"
              className={inputClass}
            />
          </div>
        </div>
        {initial.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initial.logoUrl}
            alt="Current store logo"
            className="mt-4 h-12 rounded border border-border bg-background object-contain p-1"
          />
        )}
      </section>

      {/* Inventory */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Inventory</h2>
        <div className="mt-4 max-w-xs space-y-1">
          <label htmlFor="threshold" className={labelClass}>
            Low-stock threshold
          </label>
          <input
            id="threshold"
            type="number"
            min={0}
            value={lowStockThreshold}
            onChange={(e) => setLowStockThreshold(e.target.value)}
            className={inputClass}
          />
          <p className="text-xs text-muted-foreground">
            Variants at or below this level are flagged low and surface on the dashboard.
          </p>
        </div>
      </section>

      {/* Socials */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Social links</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {SOCIAL_KEYS.map((key) => (
            <div key={key} className="space-y-1">
              <label htmlFor={`social-${key}`} className={`${labelClass} capitalize`}>
                {key}
              </label>
              <input
                id={`social-${key}`}
                value={socials[key] ?? ""}
                onChange={(e) =>
                  setSocials((s) => ({ ...s, [key]: e.target.value }))
                }
                placeholder={`https://${key}.com/…`}
                className={inputClass}
              />
            </div>
          ))}
        </div>
      </section>

      {/* Pricing rules */}
      <section className="rounded-lg border border-border bg-card p-5">
        <h2 className="font-heading text-lg font-semibold">Tax & shipping</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Advanced JSON rules consumed by the pricing engine. Changing these affects
          live checkout totals.
        </p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="space-y-1">
            <label htmlFor="taxRules" className={labelClass}>
              Tax rules (JSON)
            </label>
            <textarea
              id="taxRules"
              value={taxRulesText}
              onChange={(e) => setTaxRulesText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'{\n  "US": { "rate": 700 }\n}'}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="shippingZones" className={labelClass}>
              Shipping zones (JSON)
            </label>
            <textarea
              id="shippingZones"
              value={shippingZonesText}
              onChange={(e) => setShippingZonesText(e.target.value)}
              rows={8}
              spellCheck={false}
              placeholder={'{\n  "DEFAULT": { "flat": 500, "freeOver": 5000 }\n}'}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        </div>
      </section>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={update.isPending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {update.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          Save settings
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success">
            <Check className="h-4 w-4" aria-hidden /> Saved
          </span>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Apply pricing changes?"
        description="You changed the currency, tax rules, or shipping zones. These take effect immediately on the storefront and checkout."
        confirmLabel="Apply changes"
        tone="danger"
        loading={update.isPending}
        onConfirm={doSave}
        onCancel={() => setConfirmOpen(false)}
      />
    </form>
  );
}
