/**
 * State / province names → postal codes for the countries whose tax rules are
 * usually keyed by subdivision (#42). The checkout's "State / Region" field is
 * free text, so a shopper may type "California", "california " or "CA"; tax
 * lookup normalises all of them to "CA" before matching the merchant's rules.
 */
const US_STATES: Record<string, string> = {
  ALABAMA: 'AL',
  ALASKA: 'AK',
  ARIZONA: 'AZ',
  ARKANSAS: 'AR',
  CALIFORNIA: 'CA',
  COLORADO: 'CO',
  CONNECTICUT: 'CT',
  DELAWARE: 'DE',
  'DISTRICT OF COLUMBIA': 'DC',
  FLORIDA: 'FL',
  GEORGIA: 'GA',
  HAWAII: 'HI',
  IDAHO: 'ID',
  ILLINOIS: 'IL',
  INDIANA: 'IN',
  IOWA: 'IA',
  KANSAS: 'KS',
  KENTUCKY: 'KY',
  LOUISIANA: 'LA',
  MAINE: 'ME',
  MARYLAND: 'MD',
  MASSACHUSETTS: 'MA',
  MICHIGAN: 'MI',
  MINNESOTA: 'MN',
  MISSISSIPPI: 'MS',
  MISSOURI: 'MO',
  MONTANA: 'MT',
  NEBRASKA: 'NE',
  NEVADA: 'NV',
  'NEW HAMPSHIRE': 'NH',
  'NEW JERSEY': 'NJ',
  'NEW MEXICO': 'NM',
  'NEW YORK': 'NY',
  'NORTH CAROLINA': 'NC',
  'NORTH DAKOTA': 'ND',
  OHIO: 'OH',
  OKLAHOMA: 'OK',
  OREGON: 'OR',
  PENNSYLVANIA: 'PA',
  'RHODE ISLAND': 'RI',
  'SOUTH CAROLINA': 'SC',
  'SOUTH DAKOTA': 'SD',
  TENNESSEE: 'TN',
  TEXAS: 'TX',
  UTAH: 'UT',
  VERMONT: 'VT',
  VIRGINIA: 'VA',
  WASHINGTON: 'WA',
  'WEST VIRGINIA': 'WV',
  WISCONSIN: 'WI',
  WYOMING: 'WY',
  'PUERTO RICO': 'PR',
  GUAM: 'GU',
  'AMERICAN SAMOA': 'AS',
  'NORTHERN MARIANA ISLANDS': 'MP',
  'U.S. VIRGIN ISLANDS': 'VI',
  'US VIRGIN ISLANDS': 'VI',
};

const CA_PROVINCES: Record<string, string> = {
  ALBERTA: 'AB',
  'BRITISH COLUMBIA': 'BC',
  MANITOBA: 'MB',
  'NEW BRUNSWICK': 'NB',
  'NEWFOUNDLAND AND LABRADOR': 'NL',
  'NOVA SCOTIA': 'NS',
  ONTARIO: 'ON',
  'PRINCE EDWARD ISLAND': 'PE',
  QUEBEC: 'QC',
  SASKATCHEWAN: 'SK',
  'NORTHWEST TERRITORIES': 'NT',
  NUNAVUT: 'NU',
  YUKON: 'YT',
};

const BY_COUNTRY: Record<string, Record<string, string>> = {
  US: US_STATES,
  CA: CA_PROVINCES,
};

/** Upper-case, strip accents, and collapse whitespace. */
function canon(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toUpperCase();
}

/**
 * Canonical key for a subdivision: the postal code when the name is known for
 * that country (e.g. US "California" → "CA"), otherwise the trimmed upper-case
 * input, so codes and unknown regions still compare case-insensitively.
 */
export function normalizeRegion(country: string, state: string): string {
  const s = canon(state);
  const names = BY_COUNTRY[canon(country)];
  return names?.[s] ?? s;
}
