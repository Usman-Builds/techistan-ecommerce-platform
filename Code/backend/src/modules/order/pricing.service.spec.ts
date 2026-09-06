import { PricingService } from './pricing.service';
import { OrderAddressDto } from './dto/create-order.dto';

/**
 * Server-side money authority (script 10, FR-404/405). Shipping + destination
 * tax are computed from StoreSetting in integer cents. We mock the single
 * settings read and drive {@link PricingService.quote}. `taxRules.rate` is basis
 * points (700 = 7.00%); a per-state rate overrides the country rate.
 */
function buildService(setting: unknown) {
  const prisma = {
    storeSetting: { findFirst: jest.fn().mockResolvedValue(setting) },
  };
  return new PricingService(prisma as never);
}

const usAddress: OrderAddressDto = {
  fullName: 'A',
  line1: '1 St',
  city: 'Town',
  state: 'CA',
  postalCode: '90001',
  country: 'US',
} as OrderAddressDto;

describe('PricingService.quote — shipping', () => {
  it('uses the flat default zone when no zones are configured', async () => {
    const svc = buildService({ currency: 'USD', taxRules: null, shippingZones: null });
    const q = await svc.quote({
      address: usAddress,
      subtotalCents: 2000,
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.shippingCents).toBe(500);
    expect(q.currency).toBe('USD');
  });

  it('waives shipping over the zone free-over threshold', async () => {
    const svc = buildService({ currency: 'USD', taxRules: null, shippingZones: null });
    const q = await svc.quote({
      address: usAddress,
      subtotalCents: 5000, // >= default freeOverCents (5000)
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.shippingCents).toBe(0);
  });

  it('waives shipping when a FREE_SHIPPING coupon is applied', async () => {
    const svc = buildService({ currency: 'USD', taxRules: null, shippingZones: null });
    const q = await svc.quote({
      address: usAddress,
      subtotalCents: 1000,
      discountCents: 0,
      freeShipping: true,
    });
    expect(q.shippingCents).toBe(0);
    expect(q.shippingLabel).toMatch(/coupon/i);
  });

  it('matches a destination zone by country', async () => {
    const svc = buildService({
      currency: 'USD',
      taxRules: null,
      shippingZones: [
        { label: 'Intl', countries: ['CA', 'GB'], rateCents: 1500 },
        { label: 'Domestic', rateCents: 500 },
      ],
    });
    const gb = { ...usAddress, country: 'GB' } as OrderAddressDto;
    const q = await svc.quote({
      address: gb,
      subtotalCents: 2000,
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.shippingCents).toBe(1500);
    expect(q.shippingLabel).toBe('Intl');
  });
});

describe('PricingService.quote — tax', () => {
  const rules = {
    US: { rate: 700, states: { CA: { rate: 725 } } },
  };

  it('applies the country rate in basis points', async () => {
    const svc = buildService({ currency: 'USD', taxRules: rules, shippingZones: null });
    const ny = { ...usAddress, state: 'NY' } as OrderAddressDto;
    const q = await svc.quote({
      address: ny,
      subtotalCents: 10000,
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.taxCents).toBe(700); // 10000 * 700 / 10000
  });

  it('lets a per-state rate override the country rate', async () => {
    const svc = buildService({ currency: 'USD', taxRules: rules, shippingZones: null });
    const q = await svc.quote({
      address: usAddress, // CA
      subtotalCents: 10000,
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.taxCents).toBe(725); // CA override
  });

  it('taxes the discounted base (discount reduces the taxable amount)', async () => {
    const svc = buildService({ currency: 'USD', taxRules: rules, shippingZones: null });
    const q = await svc.quote({
      address: usAddress, // CA @ 7.25%
      subtotalCents: 10000,
      discountCents: 2000,
      freeShipping: false,
    });
    expect(q.taxCents).toBe(580); // (10000 - 2000) * 725 / 10000
  });

  it('charges no tax for an unlisted country', async () => {
    const svc = buildService({ currency: 'USD', taxRules: rules, shippingZones: null });
    const de = { ...usAddress, country: 'DE' } as OrderAddressDto;
    const q = await svc.quote({
      address: de,
      subtotalCents: 10000,
      discountCents: 0,
      freeShipping: false,
    });
    expect(q.taxCents).toBe(0);
  });
});
