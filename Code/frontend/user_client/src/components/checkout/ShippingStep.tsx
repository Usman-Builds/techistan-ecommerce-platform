"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useSavedAddresses } from "@/lib/api/hooks/orders";
import type { OrderAddress } from "@/lib/api/orders";
import type { SavedAddress } from "@/lib/api/addresses";

export interface ShippingSubmit {
  email: string;
  address: OrderAddress;
  saveAddress: boolean;
}

const INPUT =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

const EMPTY: OrderAddress = {
  fullName: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "US",
};

/**
 * Checkout step 1 — shipping (FR-402). Guests type an address freely; signed-in
 * customers can pick a saved address or type a new one (optionally saving it).
 * Google Places autocomplete (FR-403, Should) is a deferred enhancement.
 */
export function ShippingStep({
  initialEmail,
  initialAddress,
  submitting,
  error,
  onSubmit,
}: {
  initialEmail: string;
  initialAddress: OrderAddress | null;
  submitting: boolean;
  error: string | null;
  onSubmit: (data: ShippingSubmit) => void;
}) {
  const { isAuthenticated, user } = useAuth();
  const { data: saved } = useSavedAddresses(isAuthenticated);

  const [email, setEmail] = useState(initialEmail || user?.email || "");
  const [address, setAddress] = useState<OrderAddress>(initialAddress ?? EMPTY);
  const [saveAddress, setSaveAddress] = useState(false);

  const set = (key: keyof OrderAddress) => (value: string) =>
    setAddress((a) => ({ ...a, [key]: value }));

  const applySaved = (s: SavedAddress) =>
    setAddress({
      fullName: s.fullName,
      phone: s.phone ?? "",
      line1: s.line1,
      line2: s.line2 ?? "",
      city: s.city,
      state: s.state,
      postalCode: s.postalCode,
      country: s.country,
    });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ email: email.trim(), address, saveAddress });
      }}
      className="space-y-5"
    >
      {isAuthenticated && saved && saved.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium">Saved addresses</p>
          <div className="flex flex-wrap gap-2">
            {saved.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => applySaved(s)}
                className="rounded-md border border-border px-3 py-2 text-left text-xs hover:border-primary"
              >
                <span className="font-medium">{s.label ?? s.fullName}</span>
                <br />
                <span className="text-muted-foreground">
                  {s.line1}, {s.city} {s.postalCode}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <Field label="Email" required>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={isAuthenticated && Boolean(user?.email)}
          className={INPUT}
          placeholder="you@example.com"
        />
      </Field>

      <Field label="Full name" required>
        <input
          required
          value={address.fullName}
          onChange={(e) => set("fullName")(e.target.value)}
          className={INPUT}
        />
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Address line 1" required>
          <input
            required
            value={address.line1}
            onChange={(e) => set("line1")(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Address line 2">
          <input
            value={address.line2 ?? ""}
            onChange={(e) => set("line2")(e.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="City" required>
          <input
            required
            value={address.city}
            onChange={(e) => set("city")(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="State / Region" required>
          <input
            required
            value={address.state}
            onChange={(e) => set("state")(e.target.value)}
            className={INPUT}
          />
        </Field>
        <Field label="Postal code" required>
          <input
            required
            value={address.postalCode}
            onChange={(e) => set("postalCode")(e.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Country (ISO-2)" required>
          <input
            required
            maxLength={2}
            value={address.country}
            onChange={(e) =>
              set("country")(e.target.value.toUpperCase().slice(0, 2))
            }
            className={`${INPUT} uppercase`}
          />
        </Field>
        <Field label="Phone">
          <input
            value={address.phone ?? ""}
            onChange={(e) => set("phone")(e.target.value)}
            className={INPUT}
          />
        </Field>
      </div>

      {isAuthenticated && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={saveAddress}
            onChange={(e) => setSaveAddress(e.target.checked)}
            className="h-4 w-4 rounded border-input"
          />
          Save this address to my account
        </label>
      )}

      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-md bg-primary py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
      >
        {submitting ? "Calculating totals…" : "Continue to review"}
      </button>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
    </label>
  );
}
