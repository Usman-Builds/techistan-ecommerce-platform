import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { OrderAddressDto } from './dto/create-order.dto';

/** A store shipping zone (shared shape with StoreSetting.shippingZones). */
interface ShippingZone {
  label: string;
  countries?: string[]; // ISO-2 codes; omitted / empty = matches anywhere
  rateCents: number;
  freeOverCents?: number;
}

const DEFAULT_ZONES: ShippingZone[] = [
  { label: 'Standard', rateCents: 500, freeOverCents: 5000 },
];

export interface Quote {
  shippingCents: number;
  shippingLabel: string;
  taxCents: number;
  currency: string;
}

export interface QuoteInput {
  address: OrderAddressDto;
  /** Item subtotal in cents (after clamping to stock). */
  subtotalCents: number;
  /** Coupon discount in cents (reduces the taxable base). */
  discountCents: number;
  /** True when a FREE_SHIPPING coupon waives the shipping fee. */
  freeShipping: boolean;
}

/**
 * Authoritative server-side money calculation (script 10, Task 2, FR-404/405).
 * Shipping and destination-based tax are computed from `StoreSetting` in integer
 * cents; the client's displayed totals are never trusted. This runs at order
 * creation regardless of what the review step showed.
 */
@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Compute shipping + tax + currency for an order in one settings read. */
  async quote(input: QuoteInput): Promise<Quote> {
    const setting = await this.prisma.storeSetting.findFirst({
      where: { singleton: true },
      select: { currency: true, taxRules: true, shippingZones: true },
    });

    const currency = setting?.currency ?? 'USD';
    const { shippingCents, shippingLabel } = this.calculateShipping(
      input.address,
      input.subtotalCents,
      input.freeShipping,
      setting?.shippingZones,
    );
    // Tax on the discounted item subtotal (shipping is not taxed here).
    const taxableCents = Math.max(0, input.subtotalCents - input.discountCents);
    const taxCents = this.calculateTax(input.address, taxableCents, setting?.taxRules);

    return { shippingCents, shippingLabel, taxCents, currency };
  }

  /** Destination-based shipping from store zones; flat default as a fallback. */
  private calculateShipping(
    address: OrderAddressDto,
    subtotalCents: number,
    freeShipping: boolean,
    rawZones: unknown,
  ): { shippingCents: number; shippingLabel: string } {
    if (freeShipping) {
      return { shippingCents: 0, shippingLabel: 'Free shipping (coupon)' };
    }
    const zones = this.parseZones(rawZones);
    const country = address.country?.toUpperCase();
    const zone =
      zones.find((z) => z.countries?.some((c) => c.toUpperCase() === country)) ??
      zones.find((z) => !z.countries || z.countries.length === 0) ??
      zones[0];

    if (zone.freeOverCents != null && subtotalCents >= zone.freeOverCents) {
      return { shippingCents: 0, shippingLabel: `${zone.label} (free)` };
    }
    return { shippingCents: zone.rateCents, shippingLabel: zone.label };
  }

  /**
   * Destination tax from `StoreSetting.taxRules`. `rate` is basis points
   * (700 = 7.00%). Supports a country rate with an optional per-state override:
   *   { "US": { "rate": 700, "states": { "CA": { "rate": 725 } } } }
   * No matching rule → no tax.
   */
  private calculateTax(
    address: OrderAddressDto,
    taxableCents: number,
    rawRules: unknown,
  ): number {
    if (!rawRules || typeof rawRules !== 'object') return 0;
    const rules = rawRules as Record<string, unknown>;
    const country = address.country?.toUpperCase();
    const countryRule = country
      ? (rules[country] as Record<string, unknown> | undefined)
      : undefined;
    if (!countryRule) return 0;

    // Per-state override wins over the country rate.
    let rateBps = this.readRate(countryRule);
    const states = countryRule.states as Record<string, unknown> | undefined;
    if (states && address.state) {
      const stateRule = states[address.state.toUpperCase()] as
        | Record<string, unknown>
        | undefined;
      const stateRate = stateRule ? this.readRate(stateRule) : null;
      if (stateRate != null) rateBps = stateRate;
    }
    if (rateBps == null || rateBps <= 0) return 0;
    return Math.round((taxableCents * rateBps) / 10000);
  }

  private readRate(rule: Record<string, unknown>): number | null {
    const rate = rule.rate;
    return typeof rate === 'number' && rate >= 0 ? rate : null;
  }

  private parseZones(raw: unknown): ShippingZone[] {
    if (Array.isArray(raw)) {
      const zones = (raw as unknown[]).filter(
        (z): z is ShippingZone =>
          !!z &&
          typeof z === 'object' &&
          typeof (z as ShippingZone).label === 'string' &&
          typeof (z as ShippingZone).rateCents === 'number',
      );
      if (zones.length) return zones;
    }
    return DEFAULT_ZONES;
  }
}
