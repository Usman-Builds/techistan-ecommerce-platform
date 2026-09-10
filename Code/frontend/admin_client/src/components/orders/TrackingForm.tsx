"use client";

import { useState } from "react";
import { Loader2, Truck } from "lucide-react";
import type { Carrier, ShipmentEvent } from "@/lib/api/orders";
import { useSetTracking } from "@/lib/api/hooks/orders";
import { ApiError } from "@/lib/api/client";

const CARRIERS: Carrier[] = ["UPS", "USPS", "FEDEX", "DHL", "OTHER"];

/**
 * Set-tracking form (FR-504). Recording tracking creates a ShipmentEvent, builds
 * the carrier URL, and ships the order — all server-side. Shows the existing
 * shipment history.
 */
export function TrackingForm({
  orderId,
  events,
}: {
  orderId: string;
  events: ShipmentEvent[];
}) {
  const [carrier, setCarrier] = useState<Carrier>("UPS");
  const [trackingNumber, setTrackingNumber] = useState("");
  const mutation = useSetTracking(orderId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trackingNumber.trim()) return;
    await mutation.mutateAsync({ carrier, trackingNumber: trackingNumber.trim() });
    setTrackingNumber("");
  };

  const errorMessage =
    mutation.error instanceof ApiError ? mutation.error.message : null;

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <Truck className="h-4 w-4" aria-hidden /> Shipment tracking
      </h2>

      {events.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm">
          {events.map((ev) => (
            <li key={ev.id} className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {new Date(ev.occurredAt).toLocaleDateString("en-US")}
              </span>
              <span className="font-medium">{ev.carrier}</span>
              <span>{ev.trackingNumber}</span>
              {ev.trackingUrl && (
                <a
                  href={ev.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Track →
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-3 space-y-2">
        <div className="flex gap-2">
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value as Carrier)}
            aria-label="Carrier"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {CARRIERS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={trackingNumber}
            onChange={(e) => setTrackingNumber(e.target.value)}
            placeholder="Tracking number"
            aria-label="Tracking number"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>
        <button
          type="submit"
          disabled={!trackingNumber.trim() || mutation.isPending}
          className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {mutation.isPending && (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          )}
          Add tracking & mark shipped
        </button>
        {errorMessage && (
          <p className="text-sm text-destructive">{errorMessage}</p>
        )}
      </form>
    </div>
  );
}
