/**
 * Shipping zones as the pricing engine reads them (#34): an ordered ARRAY; the
 * first zone whose `countries` contains the destination wins, and a zone with
 * no `countries` is the catch-all. Money is integer cents.
 */
export interface ShippingZone {
  label: string;
  rateCents: number;
  /** ISO 3166-1 alpha-2 codes. Omit for "everywhere else". */
  countries?: string[];
  freeOverCents?: number;
}

export const SHIPPING_ZONES_PLACEHOLDER = `[
  { "label": "US", "countries": ["US"], "rateCents": 900, "freeOverCents": 10000 },
  { "label": "Rest of world", "rateCents": 2500 }
]`;

/**
 * Parse the settings textarea. Empty → null (use the built-in default). Throws
 * a user-facing message when the text isn't a JSON array of zones; the API
 * re-validates every field.
 */
export function parseShippingZones(text: string): ShippingZone[] | null {
  const t = text.trim();
  if (t === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch {
    throw new Error("Shipping zones is not valid JSON.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error(
      'Shipping zones must be a JSON array, e.g. [{ "label": "US", "countries": ["US"], "rateCents": 900 }].',
    );
  }
  parsed.forEach((z, i) => {
    const zone = z as Partial<ShippingZone> | null;
    if (
      !zone ||
      typeof zone !== "object" ||
      typeof zone.label !== "string" ||
      typeof zone.rateCents !== "number"
    ) {
      throw new Error(
        `Shipping zone ${i + 1} needs a "label" and a numeric "rateCents".`,
      );
    }
  });
  return parsed as ShippingZone[];
}
