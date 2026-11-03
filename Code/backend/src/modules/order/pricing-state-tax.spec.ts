import { PricingService } from './pricing.service';
import { OrderAddressDto } from './dto/create-order.dto';
import { normalizeRegion } from './region-codes';

/**
 * #42: the checkout's "State / Region" field is free text, so the state-tax
 * override must match however the shopper writes the state: code or full
 * name, any case, with stray whitespace. 600 bps country rate, 725 bps CA.
 */
const US_RULES = {
  US: { rate: 600, states: { CA: { rate: 725 } } },
  CA: { rate: 500, states: { QC: { rate: 1498 } } },
};

function taxFor(country: string, state: string, rules: unknown = US_RULES) {
  const prisma = {
    storeSetting: {
      findFirst: jest.fn().mockResolvedValue({
        currency: 'USD',
        taxRules: rules,
        shippingZones: null,
      }),
    },
  };
  const svc = new PricingService(prisma as never);
  return svc
    .quote({
      address: {
        fullName: 'A',
        line1: '1 St',
        city: 'Town',
        postalCode: '90001',
        country,
        state,
      } as OrderAddressDto,
      subtotalCents: 10000,
      discountCents: 0,
      freeShipping: true,
    })
    .then((q) => q.taxCents);
}

describe('PricingService state tax matching', () => {
  it.each(['CA', 'ca', ' CA ', 'California', 'california ', 'CALIFORNIA'])(
    'applies the CA override for state %j',
    async (state) => {
      await expect(taxFor('US', state)).resolves.toBe(725);
    },
  );

  it('accepts a padded or lower-case country code', async () => {
    await expect(taxFor(' us ', 'California')).resolves.toBe(725);
  });

  it('applies a Canadian province by name', async () => {
    await expect(taxFor('CA', 'Québec')).resolves.toBe(1498);
    await expect(taxFor('CA', 'quebec')).resolves.toBe(1498);
  });

  it('falls back to the country rate for another state', async () => {
    await expect(taxFor('US', 'Texas')).resolves.toBe(600);
  });

  it('matches a merchant rule keyed by the full state name', async () => {
    const rules = { US: { rate: 600, states: { California: { rate: 725 } } } };
    await expect(taxFor('US', 'CA', rules)).resolves.toBe(725);
  });
});

describe('normalizeRegion', () => {
  it.each([
    ['US', 'New York', 'NY'],
    ['US', 'district of columbia', 'DC'],
    ['US', ' tx ', 'TX'],
    ['CA', 'British Columbia', 'BC'],
    ['GB', ' Greater London ', 'GREATER LONDON'],
  ])('%s %j -> %s', (country, state, code) => {
    expect(normalizeRegion(country, state)).toBe(code);
  });
});
