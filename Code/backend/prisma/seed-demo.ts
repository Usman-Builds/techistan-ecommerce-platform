/**
 * Rich demo seed — `npm run seed:demo`.
 *
 * Populates the whole domain with realistic, inter-linked test data (a consumer-
 * electronics catalog with REAL product photos, customers, carts, orders across
 * every status, coupons, reviews, notifications, …) so the admin + storefront can
 * be exercised end-to-end.
 *
 * Design notes:
 *  - IDEMPOTENT: every cuid-id row is created with an explicit, stable `dm_*` id and
 *    upserted, so re-running updates in place instead of duplicating. Users (Int id)
 *    are keyed by email. Safe to run as many times as you like.
 *  - SELF-PRUNING: `dm_*` rows from a PREVIOUS version of this file (e.g. the old
 *    apparel catalog) are deleted before the upserts, so the demo dataset always
 *    matches this file exactly. It only ever touches `dm_*` rows — real data is
 *    never deleted.
 *  - ADDITIVE + SAFE otherwise: it layers demo data on top of an existing DB and
 *    does NOT weaken the production-safe `prisma db seed` (that stays minimal).
 *    Run this only against a dev database.
 *  - Money is always integer cents. Prices/ratings/tax follow the schema conventions
 *    (ratingAverage is mean×100).
 *
 * Demo customer login (all four): password `Passw0rd!`
 *   alice@example.com · bob@example.com · carol@example.com · david@example.com
 * Admin login stays whatever ADMIN_EMAIL/ADMIN_PASSWORD are in .env.development.
 */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { loadSeedEnv, seedAdmin } from './admin';

loadSeedEnv();
const prisma = new PrismaClient();

// ─────────────────────────── helpers ───────────────────────────

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);

/** Real Unsplash product photography. Swap for your own Cloudinary URLs once
 *  media is uploaded — the app renders `url` directly (the custom next/image
 *  loader passes absolute non-Cloudinary URLs straight through). */
const img = (id: string) =>
  `https://images.unsplash.com/photo-${id}?w=1000&q=80&auto=format&fit=crop`;

/**
 * Verified Unsplash photo ids, keyed by what they actually DEPICT.
 *
 * Every id below was checked twice before being committed: an HTTP request to
 * the delivery URL returning `200 image/*`, and a visual check of the rendered
 * thumbnail to confirm the subject matches the name. Re-verify with:
 *
 *   node -e "const ids=require('./seed-photo-ids.json'); …"   // or simply:
 *   curl -o /dev/null -w '%{http_code} %{content_type}\n' \
 *     'https://images.unsplash.com/photo-<id>?w=1000&q=80&auto=format&fit=crop'
 *
 * Photo ids are permanent on Unsplash but a photographer can withdraw an image,
 * so a 404 here means "pick a replacement", not "the seed is broken".
 */
const PHOTO = {
  // Laptops / computers
  laptopStudio: '1588872657578-7efd1f1555ed', // clean laptop, studio white
  laptopWood: '1541807084-5c52b6b3adef', // dark laptop open on wood
  laptopGlow: '1531297484001-80022131f5a1', // laptop glowing in the dark
  laptopRgb: '1606229365485-93a3b8ee0385', // RGB-backlit keyboard, dark
  laptop2in1: '1587614382346-4ec70e388b28', // detachable 2-in-1 + keyboard
  desktopAio: '1527443224154-c4a3942d3acf', // all-in-one desktop, white bg
  desktopTower: '1593640408182-31c70c8268f5', // tower + monitor gaming setup
  pcBuildRgb: '1597872200969-2b65d56bd16b', // RGB water-cooled internals
  gpu: '1591405351990-4726e331f141', // two graphics cards
  monitorDesk: '1616763355603-9755a640a287', // monitor on a riser, desk
  deskFlatlay: '1519389950473-47ba0277781c', // overhead desk with laptops

  // Mobile
  phoneDark: '1601784551446-20c9e07cdbdb', // phone, dark UI, angled
  phoneCamera: '1574944985070-8f3ebc6b79d2', // rear camera array close-up
  phoneTrio: '1556656793-08538906a9f8', // three phones, pastel flat lay
  phoneFlat: '1580910051074-3eb694886505', // single phone, white flat lay
  watchBlack: '1546868871-7041f2a55e12', // black smartwatch, product shot
  watchSilver: '1579586337278-3befd40fd17a', // silver smartwatch, angled
  watchWrist: '1508685096489-7aacd43bd3b1', // smartwatch worn on a wrist

  // Audio
  headphonesWhiteBg: '1546435770-a3e426bf472b', // black over-ear, white bg
  headphonesBlackBg: '1487215078519-e21cc028cb29', // over-ear, black bg
  headphonesDetail: '1585771724684-38269d6639fd', // earcup detail, warm light
  headphonesStand: '1583394838336-acd977736f90', // over-ear on a stand
  earbudsCase: '1590658268037-6bf12165a8df', // true-wireless buds in case
  earbudsWhite: '1608156639585-b3a032ef9689', // white earbuds, white bg
  speakerFabric: '1543512214-318c7553f230', // fabric-wrapped smart speaker
  speakerPuck: '1512446816042-444d641267d4', // compact speaker, lit ring

  // Gaming
  console: '1606144042614-b2417e99c4e3', // console + controller
  controllerWhiteBg: '1592840496694-26d035b52b48', // controller, white bg
  controllerPair: '1580327344181-c1163234e5a0', // two controllers, yellow bg
  keyboardMech: '1618384887929-16ec33fab9ef', // mechanical keyboard, marble
  keycaps: '1595225476474-87563907a212', // keycap close-up
  mouseRgb: '1613141411244-0e4ac259d217', // honeycomb RGB gaming mouse
  mouseBlack: '1615663245857-ac93bb7c39e7', // black gaming mouse, black bg
  esports: '1542751371-adc38448a05e', // esports battlestation

  // Cameras & drones
  cameraFront: '1502920917128-1aa500764cbd', // DSLR body, white bg
  cameraLenses: '1516035069371-29a1b244cc32', // camera + lenses, dark
  droneWater: '1507582020474-9a35b7d455d9', // folding drone in flight
  droneForest: '1473968512647-3e447244af8f', // quadcopter over forest

  // Accessories
  keyboardSlim: '1587829741301-dc798b83add3', // slim white keyboard
  mouseWireless: '1527864550417-7fd91fc51a46', // compact wireless mouse
  charger: '1583863788434-e58a36330cf0', // white GaN power adapter
  cableUsbc: '1585386959984-a4155224a1ad', // braided USB-C cable
  networkPanel: '1544197150-b99a580bb7a8', // ethernet patch panel
  laptopSleeve: '1547949003-9792a18a2601', // felt laptop sleeve
  smartHome: '1558089687-f282ffcbc126', // smart-home device trio

  // Added with the storefront redesign, to give the new homepage rails enough
  // distinct artwork. Verified the same way as the set above: HTTP 200 from the
  // delivery URL, then the rendered thumbnail inspected to confirm the subject.
  // Preference was for shots with no legible third-party wordmark, since the
  // catalog sells fictional brands (Nimbus, Orbit, Aether, Kryon, ...).
  laptopMarble: '1593642632823-8f785ba67e45', // slim ultrabook on marble, window light
  pcTowerBlue: '1587202372775-e229f172b9d7', // glass tower, blue-lit fans, dark room
  tabletPair: '1585790050230-5dd28404ccb9', // two tablets, white flat lay
  phoneTabletDark: '1616353071855-2c045c4458ae', // phone + tablet, moody dark flat lay
  headphonesTan: '1484704849700-f032a568e944', // tan/silver on-ear, warm light
  headphonesPastel: '1524678606370-a47ad25cb82a', // pink on-ear on pink/mint split
  earbudsMinimal: '1600294037681-c80b4cb5b434', // white earbuds + case, white bg
  keyboardBacklit: '1547394765-185e1e68f34e', // blue-backlit keyboard close-up
  keyboardWhiteFlat: '1541140532154-b024d705b90a', // white keyboard, top-down, white bg
  gamingDeskRgb: '1629429407759-01cd3d7cfb38', // RGB keyboard, mouse and controller
} as const;

const DEMO_PASSWORD = 'Passw0rd!';
const TAX_RATE = 0.07; // matches storeSetting.taxRules US rate below
const tax = (cents: number) => Math.round(cents * TAX_RATE);

// ─────────────────────────── data ───────────────────────────

const CATEGORIES = [
  { id: 'dm_cat_computers', name: 'Computers', slug: 'computers', parentId: null, sortOrder: 1, img: PHOTO.deskFlatlay },
  { id: 'dm_cat_laptops', name: 'Laptops', slug: 'laptops', parentId: 'dm_cat_computers', sortOrder: 1, img: PHOTO.laptopWood },
  { id: 'dm_cat_desktops', name: 'Desktops & Monitors', slug: 'desktops-monitors', parentId: 'dm_cat_computers', sortOrder: 2, img: PHOTO.desktopTower },
  { id: 'dm_cat_components', name: 'PC Components', slug: 'pc-components', parentId: 'dm_cat_computers', sortOrder: 3, img: PHOTO.pcBuildRgb },
  { id: 'dm_cat_mobile', name: 'Mobile', slug: 'mobile', parentId: null, sortOrder: 2, img: PHOTO.phoneTrio },
  { id: 'dm_cat_phones', name: 'Smartphones', slug: 'smartphones', parentId: 'dm_cat_mobile', sortOrder: 1, img: PHOTO.phoneFlat },
  { id: 'dm_cat_wearables', name: 'Wearables', slug: 'wearables', parentId: 'dm_cat_mobile', sortOrder: 2, img: PHOTO.watchWrist },
  { id: 'dm_cat_tablets', name: 'Tablets', slug: 'tablets', parentId: 'dm_cat_mobile', sortOrder: 3, img: PHOTO.tabletPair },
  { id: 'dm_cat_audio', name: 'Audio', slug: 'audio', parentId: null, sortOrder: 3, img: PHOTO.headphonesStand },
  { id: 'dm_cat_headphones', name: 'Headphones', slug: 'headphones', parentId: 'dm_cat_audio', sortOrder: 1, img: PHOTO.headphonesWhiteBg },
  { id: 'dm_cat_speakers', name: 'Speakers', slug: 'speakers', parentId: 'dm_cat_audio', sortOrder: 2, img: PHOTO.speakerFabric },
  { id: 'dm_cat_gaming', name: 'Gaming', slug: 'gaming', parentId: null, sortOrder: 4, img: PHOTO.esports },
  { id: 'dm_cat_consoles', name: 'Consoles', slug: 'consoles', parentId: 'dm_cat_gaming', sortOrder: 1, img: PHOTO.console },
  { id: 'dm_cat_gaminggear', name: 'Gaming Gear', slug: 'gaming-gear', parentId: 'dm_cat_gaming', sortOrder: 2, img: PHOTO.keyboardMech },
  { id: 'dm_cat_imaging', name: 'Cameras & Drones', slug: 'cameras-drones', parentId: null, sortOrder: 5, img: PHOTO.droneForest },
  { id: 'dm_cat_accessories', name: 'Accessories', slug: 'accessories', parentId: null, sortOrder: 6, img: PHOTO.charger },
  { id: 'dm_cat_peripherals', name: 'Peripherals', slug: 'peripherals', parentId: 'dm_cat_accessories', sortOrder: 1, img: PHOTO.keyboardSlim },
  { id: 'dm_cat_power', name: 'Power & Cables', slug: 'power-cables', parentId: 'dm_cat_accessories', sortOrder: 2, img: PHOTO.cableUsbc },
  { id: 'dm_cat_networking', name: 'Networking', slug: 'networking', parentId: 'dm_cat_accessories', sortOrder: 3, img: PHOTO.networkPanel },
];

const BRANDS = [
  { id: 'dm_brand_nimbus', name: 'Nimbus Systems', slug: 'nimbus-systems' },
  { id: 'dm_brand_kryon', name: 'Kryon', slug: 'kryon' },
  { id: 'dm_brand_orbit', name: 'Orbit', slug: 'orbit' },
  { id: 'dm_brand_aether', name: 'Aether Audio', slug: 'aether-audio' },
  { id: 'dm_brand_pixelforge', name: 'Pixelforge', slug: 'pixelforge' },
  { id: 'dm_brand_corevex', name: 'Corevex', slug: 'corevex' },
  { id: 'dm_brand_volt', name: 'Volt Labs', slug: 'volt-labs' },
];

const TAGS = [
  { id: 'dm_tag_wireless', name: 'Wireless', slug: 'wireless' },
  { id: 'dm_tag_anc', name: 'Noise Cancelling', slug: 'noise-cancelling' },
  { id: 'dm_tag_bestseller', name: 'Bestseller', slug: 'bestseller' },
  { id: 'dm_tag_new', name: 'New Arrival', slug: 'new-arrival' },
  { id: 'dm_tag_sale', name: 'On Sale', slug: 'on-sale' },
  { id: 'dm_tag_gaming', name: 'Gaming', slug: 'gaming' },
  { id: 'dm_tag_4k', name: '4K', slug: '4k' },
  { id: 'dm_tag_fastcharge', name: 'Fast Charging', slug: 'fast-charging' },
  { id: 'dm_tag_rgb', name: 'RGB', slug: 'rgb' },
  { id: 'dm_tag_portable', name: 'Portable', slug: 'portable' },
  { id: 'dm_tag_gift', name: 'Gift Idea', slug: 'gift-idea' },
  { id: 'dm_tag_pro', name: 'Pro', slug: 'pro' },
];

type VariantSeed = {
  id: string;
  sku: string;
  price: number;
  stock: number;
  options: Record<string, string>;
  compareAtPrice?: number;
  salePrice?: number;
  saleStartsAt?: Date;
  saleEndsAt?: Date;
  weightGrams?: number;
};

type ProductSeed = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  categoryId: string;
  brandId: string;
  tags: string[];
  ratingAverage: number; // mean × 100
  ratingCount: number;
  images: { id: string; unsplash: string; alt: string }[];
  variants: VariantSeed[];
};

const saleWindow = { saleStartsAt: daysAgo(5), saleEndsAt: daysFromNow(10) };

const PRODUCTS: ProductSeed[] = [
  {
    id: 'dm_prod_aurora_14',
    slug: 'aurora-14-ultrabook',
    title: 'Aurora 14 Ultrabook',
    description:
      'A 1.2kg magnesium-alloy ultrabook with a 14" 3K OLED display, 12-core CPU and 18-hour battery. Thunderbolt 4 on both sides. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_laptops',
    brandId: 'dm_brand_nimbus',
    tags: ['dm_tag_bestseller', 'dm_tag_sale', 'dm_tag_portable', 'dm_tag_pro'],
    ratingAverage: 450,
    ratingCount: 2,
    images: [
      { id: 'dm_img_aurora_1', unsplash: PHOTO.laptopStudio, alt: 'Aurora 14 ultrabook, open, studio shot' },
      { id: 'dm_img_aurora_2', unsplash: PHOTO.laptopWood, alt: 'Aurora 14 open on a wooden desk' },
    ],
    variants: [
      { id: 'dm_var_aurora_16_512', sku: 'AUR14-16-512', price: 129900, compareAtPrice: 139900, salePrice: 114900, ...saleWindow, stock: 34, weightGrams: 1200, options: { RAM: '16GB', Storage: '512GB' } },
      { id: 'dm_var_aurora_32_1t', sku: 'AUR14-32-1T', price: 159900, compareAtPrice: 169900, salePrice: 139900, ...saleWindow, stock: 18, weightGrams: 1220, options: { RAM: '32GB', Storage: '1TB' } },
    ],
  },
  {
    id: 'dm_prod_vantage_15',
    slug: 'vantage-15-gaming-laptop',
    title: 'Vantage 15 Gaming Laptop',
    description:
      '15.6" 240Hz QHD panel, vapour-chamber cooling and a per-key RGB keyboard. Built for high-refresh competitive play.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_laptops',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_rgb', 'dm_tag_new'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_vantage_1', unsplash: PHOTO.laptopRgb, alt: 'Vantage 15 with RGB-backlit keyboard' },
      { id: 'dm_img_vantage_2', unsplash: PHOTO.laptopGlow, alt: 'Vantage 15 half-open, screen glowing' },
    ],
    variants: [
      { id: 'dm_var_vantage_4060', sku: 'VAN15-4060', price: 174900, stock: 21, weightGrams: 2300, options: { GPU: 'RTX 4060', Storage: '1TB' } },
      { id: 'dm_var_vantage_4070', sku: 'VAN15-4070', price: 199900, stock: 12, weightGrams: 2350, options: { GPU: 'RTX 4070', Storage: '1TB' } },
    ],
  },
  {
    id: 'dm_prod_nimbus_flex',
    slug: 'nimbus-flex-2-in-1',
    title: 'Nimbus Flex 2-in-1 (Coming Soon)',
    description:
      'Draft product — not yet published. Used to verify DRAFT status is hidden from the storefront.',
    status: 'DRAFT',
    categoryId: 'dm_cat_laptops',
    brandId: 'dm_brand_nimbus',
    tags: ['dm_tag_new'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_flex_1', unsplash: PHOTO.laptop2in1, alt: 'Detachable 2-in-1 tablet with keyboard cover' },
    ],
    variants: [
      { id: 'dm_var_flex_256', sku: 'FLEX-256', price: 99900, stock: 0, weightGrams: 780, options: { Storage: '256GB' } },
    ],
  },
  {
    id: 'dm_prod_meridian_aio',
    slug: 'meridian-all-in-one-27',
    title: 'Meridian All-in-One 27"',
    description:
      'A 27" 5K all-in-one with a colour-calibrated display, six-speaker array and a cable-free desk footprint.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_desktops',
    brandId: 'dm_brand_nimbus',
    tags: ['dm_tag_4k', 'dm_tag_pro'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_meridian_1', unsplash: PHOTO.desktopAio, alt: 'Meridian all-in-one desktop, white background' },
      { id: 'dm_img_meridian_2', unsplash: PHOTO.monitorDesk, alt: 'Meridian on a desk with keyboard and mouse' },
    ],
    variants: [
      { id: 'dm_var_meridian_i5', sku: 'MER27-I5-16', price: 109900, stock: 15, weightGrams: 7800, options: { CPU: 'i5', RAM: '16GB' } },
      { id: 'dm_var_meridian_i7', sku: 'MER27-I7-32', price: 139900, stock: 9, weightGrams: 7900, options: { CPU: 'i7', RAM: '32GB' } },
    ],
  },
  {
    id: 'dm_prod_forge_tower',
    slug: 'forge-rgb-desktop-tower',
    title: 'Forge RGB Desktop Tower',
    description:
      'Hand-built tower with a 360mm AIO loop, tempered-glass side panel and addressable RGB throughout. **Low stock.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_desktops',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_gaming', 'dm_tag_rgb'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_forge_1', unsplash: PHOTO.pcBuildRgb, alt: 'RGB-lit water-cooled PC internals' },
      { id: 'dm_img_forge_2', unsplash: PHOTO.desktopTower, alt: 'Forge tower next to a widescreen monitor' },
    ],
    variants: [
      { id: 'dm_var_forge_mid', sku: 'FORGE-MID', price: 189900, stock: 3, weightGrams: 12500, options: { Tier: 'Mid' } },
      { id: 'dm_var_forge_ultra', sku: 'FORGE-ULTRA', price: 289900, stock: 2, weightGrams: 14200, options: { Tier: 'Ultra' } },
    ],
  },
  {
    id: 'dm_prod_kestrel_gpu',
    slug: 'kestrel-gx-graphics-card',
    title: 'Kestrel GX Graphics Card',
    description:
      'Triple-fan graphics card with a vapour chamber and a zero-RPM idle mode. Ray tracing and hardware upscaling supported.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_components',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_gaming', 'dm_tag_new'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_kestrel_1', unsplash: PHOTO.gpu, alt: 'Two graphics cards on a dark surface' },
    ],
    variants: [
      { id: 'dm_var_kestrel_12', sku: 'KGX-12G', price: 59900, stock: 26, weightGrams: 1350, options: { VRAM: '12GB' } },
      { id: 'dm_var_kestrel_16', sku: 'KGX-16G', price: 79900, stock: 14, weightGrams: 1480, options: { VRAM: '16GB' } },
    ],
  },
  {
    id: 'dm_prod_orbit_x5',
    slug: 'orbit-x5-smartphone',
    title: 'Orbit X5 Smartphone',
    description:
      '6.7" LTPO display, triple 50MP camera system with sensor-shift stabilisation, and two-day battery life. 5G on every band.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_phones',
    brandId: 'dm_brand_orbit',
    tags: ['dm_tag_bestseller', 'dm_tag_4k', 'dm_tag_gift'],
    ratingAverage: 450,
    ratingCount: 2,
    images: [
      { id: 'dm_img_x5_1', unsplash: PHOTO.phoneDark, alt: 'Orbit X5 angled, dark home screen' },
      { id: 'dm_img_x5_2', unsplash: PHOTO.phoneCamera, alt: 'Orbit X5 rear camera array close-up' },
      { id: 'dm_img_x5_3', unsplash: PHOTO.phoneTrio, alt: 'Orbit X5 in three colourways' },
    ],
    variants: [
      { id: 'dm_var_x5_128_mid', sku: 'X5-128-MID', price: 89900, stock: 48, weightGrams: 195, options: { Storage: '128GB', Color: 'Midnight' } },
      { id: 'dm_var_x5_256_mid', sku: 'X5-256-MID', price: 99900, stock: 31, weightGrams: 195, options: { Storage: '256GB', Color: 'Midnight' } },
      { id: 'dm_var_x5_256_slv', sku: 'X5-256-SLV', price: 99900, stock: 22, weightGrams: 195, options: { Storage: '256GB', Color: 'Silver' } },
    ],
  },
  {
    id: 'dm_prod_orbit_pulse',
    slug: 'orbit-pulse-smartwatch',
    title: 'Orbit Pulse Smartwatch',
    description:
      'Always-on AMOLED, ECG and blood-oxygen sensors, built-in GPS and a 5-day battery. Swim-proof to 50m. On sale.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_wearables',
    brandId: 'dm_brand_orbit',
    tags: ['dm_tag_wireless', 'dm_tag_sale', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_pulse_1', unsplash: PHOTO.watchBlack, alt: 'Orbit Pulse smartwatch, black sport band' },
      { id: 'dm_img_pulse_2', unsplash: PHOTO.watchSilver, alt: 'Orbit Pulse smartwatch, silver case' },
    ],
    variants: [
      { id: 'dm_var_pulse_41_blk', sku: 'PULSE-41-BLK', price: 34900, compareAtPrice: 39900, salePrice: 27900, ...saleWindow, stock: 55, weightGrams: 38, options: { Size: '41mm', Color: 'Black' } },
      { id: 'dm_var_pulse_45_blk', sku: 'PULSE-45-BLK', price: 37900, compareAtPrice: 42900, salePrice: 29900, ...saleWindow, stock: 40, weightGrams: 44, options: { Size: '45mm', Color: 'Black' } },
      { id: 'dm_var_pulse_45_slv', sku: 'PULSE-45-SLV', price: 37900, compareAtPrice: 42900, salePrice: 29900, ...saleWindow, stock: 27, weightGrams: 44, options: { Size: '45mm', Color: 'Silver' } },
    ],
  },
  {
    id: 'dm_prod_aether_anc',
    slug: 'aether-anc-headphones',
    title: 'Aether ANC Over-Ear Headphones',
    description:
      'Adaptive active noise cancellation, 30-hour battery, USB-C fast charge and multipoint Bluetooth. Memory-foam earcups.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_headphones',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_wireless', 'dm_tag_anc', 'dm_tag_bestseller', 'dm_tag_gift'],
    ratingAverage: 450,
    ratingCount: 2,
    images: [
      { id: 'dm_img_anc_1', unsplash: PHOTO.headphonesWhiteBg, alt: 'Aether ANC headphones, black, white background' },
      { id: 'dm_img_anc_2', unsplash: PHOTO.headphonesBlackBg, alt: 'Aether ANC headphones on a black surface' },
      { id: 'dm_img_anc_3', unsplash: PHOTO.headphonesDetail, alt: 'Aether ANC earcup detail' },
    ],
    variants: [
      { id: 'dm_var_anc_blk', sku: 'AANC-BLK', price: 19999, stock: 44, weightGrams: 250, options: { Color: 'Black' } },
      { id: 'dm_var_anc_snd', sku: 'AANC-SND', price: 19999, stock: 20, weightGrams: 250, options: { Color: 'Sand' } },
    ],
  },
  {
    id: 'dm_prod_aether_drift',
    slug: 'aether-drift-earbuds',
    title: 'Aether Drift Wireless Earbuds',
    description:
      'True-wireless earbuds with adaptive ANC, transparency mode and a wireless charging case. IPX4 sweat resistant. On sale.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_headphones',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_wireless', 'dm_tag_anc', 'dm_tag_sale', 'dm_tag_portable'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_drift_1', unsplash: PHOTO.earbudsCase, alt: 'Aether Drift earbuds in their charging case' },
      { id: 'dm_img_drift_2', unsplash: PHOTO.earbudsWhite, alt: 'Aether Drift earbuds, white background' },
    ],
    variants: [
      { id: 'dm_var_drift_wht', sku: 'DRIFT-WHT', price: 12999, compareAtPrice: 14999, salePrice: 9999, ...saleWindow, stock: 68, weightGrams: 55, options: { Color: 'White' } },
    ],
  },
  {
    id: 'dm_prod_aether_room',
    slug: 'aether-room-speaker',
    title: 'Aether Room Speaker',
    description:
      'A room-filling smart speaker with automatic room correction, Wi-Fi multiroom and a woven recycled-fabric shell.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_speakers',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_wireless', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_room_1', unsplash: PHOTO.speakerFabric, alt: 'Aether Room speaker in grey fabric' },
      { id: 'dm_img_room_2', unsplash: PHOTO.speakerPuck, alt: 'Compact Aether speaker with a lit ring' },
    ],
    variants: [
      { id: 'dm_var_room_gry', sku: 'ROOM-GRY', price: 17999, stock: 30, weightGrams: 1400, options: { Color: 'Grey' } },
      { id: 'dm_var_room_chr', sku: 'ROOM-CHR', price: 17999, stock: 24, weightGrams: 1400, options: { Color: 'Charcoal' } },
    ],
  },
  {
    id: 'dm_prod_kryon_keyboard',
    slug: 'kryon-tactile-mechanical-keyboard',
    title: 'Kryon Tactile Mechanical Keyboard',
    description:
      'Hot-swappable 75% mechanical keyboard with gasket mounting, PBT double-shot keycaps and per-key RGB. Wired or 2.4GHz.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_gaminggear',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_rgb', 'dm_tag_bestseller'],
    ratingAverage: 500,
    ratingCount: 1,
    images: [
      { id: 'dm_img_kbd_1', unsplash: PHOTO.keyboardMech, alt: 'Kryon mechanical keyboard on a marble desk' },
      { id: 'dm_img_kbd_2', unsplash: PHOTO.keycaps, alt: 'Kryon keycap and switch close-up' },
    ],
    variants: [
      { id: 'dm_var_kbd_brown', sku: 'KRY-KB-BRN', price: 12900, stock: 52, weightGrams: 820, options: { Switch: 'Tactile Brown' } },
      { id: 'dm_var_kbd_red', sku: 'KRY-KB-RED', price: 12900, stock: 37, weightGrams: 820, options: { Switch: 'Linear Red' } },
    ],
  },
  {
    id: 'dm_prod_kryon_mouse',
    slug: 'kryon-lightspeed-gaming-mouse',
    title: 'Kryon Lightspeed Gaming Mouse',
    description:
      '58g honeycomb shell, 26K optical sensor and a 1000Hz wireless polling rate. Eight programmable buttons.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_gaminggear',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_wireless', 'dm_tag_rgb', 'dm_tag_sale'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_mouse_1', unsplash: PHOTO.mouseRgb, alt: 'Kryon honeycomb gaming mouse with RGB accents' },
      { id: 'dm_img_mouse_2', unsplash: PHOTO.mouseBlack, alt: 'Kryon gaming mouse, black on black' },
    ],
    variants: [
      { id: 'dm_var_mouse_blk', sku: 'KRY-MS-BLK', price: 7900, compareAtPrice: 8900, salePrice: 5900, ...saleWindow, stock: 74, weightGrams: 58, options: { Color: 'Black' } },
      { id: 'dm_var_mouse_wht', sku: 'KRY-MS-WHT', price: 7900, compareAtPrice: 8900, salePrice: 5900, ...saleWindow, stock: 41, weightGrams: 58, options: { Color: 'White' } },
    ],
  },
  {
    id: 'dm_prod_nova_console',
    slug: 'nova-play-console',
    title: 'Nova Play Console',
    description:
      '4K/120Hz console with a 1TB NVMe drive, haptic controller and near-instant resume. **Low stock.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_consoles',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_4k', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_nova_1', unsplash: PHOTO.console, alt: 'Nova Play console with its controller' },
      { id: 'dm_img_nova_2', unsplash: PHOTO.controllerPair, alt: 'Two Nova controllers on a yellow background' },
    ],
    variants: [
      { id: 'dm_var_nova_1t', sku: 'NOVA-1T', price: 49900, stock: 4, weightGrams: 4200, options: { Storage: '1TB' } },
    ],
  },
  {
    id: 'dm_prod_nova_controller',
    slug: 'nova-wireless-controller',
    title: 'Nova Wireless Controller',
    description:
      'Hall-effect thumbsticks, adaptive triggers and a 40-hour battery. Pairs with the console, PC and mobile.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_consoles',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_wireless', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_ctrl_1', unsplash: PHOTO.controllerWhiteBg, alt: 'Nova wireless controller, white background' },
    ],
    variants: [
      { id: 'dm_var_ctrl_blk', sku: 'NOVA-CTL-BLK', price: 6999, stock: 90, weightGrams: 280, options: { Color: 'Black' } },
      { id: 'dm_var_ctrl_wht', sku: 'NOVA-CTL-WHT', price: 6999, stock: 66, weightGrams: 280, options: { Color: 'White' } },
    ],
  },
  {
    id: 'dm_prod_pixelforge_r7',
    slug: 'pixelforge-r7-mirrorless-camera',
    title: 'Pixelforge R7 Mirrorless Camera',
    description:
      '32MP APS-C sensor, in-body stabilisation, 4K/60 10-bit video and a weather-sealed body. Dual card slots.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_imaging',
    brandId: 'dm_brand_pixelforge',
    tags: ['dm_tag_4k', 'dm_tag_pro'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_r7_1', unsplash: PHOTO.cameraFront, alt: 'Pixelforge R7 camera body, white background' },
      { id: 'dm_img_r7_2', unsplash: PHOTO.cameraLenses, alt: 'Pixelforge R7 with two lenses' },
    ],
    variants: [
      { id: 'dm_var_r7_body', sku: 'PFR7-BODY', price: 119900, stock: 11, weightGrams: 612, options: { Kit: 'Body only' } },
      { id: 'dm_var_r7_kit', sku: 'PFR7-KIT1855', price: 139900, stock: 8, weightGrams: 920, options: { Kit: '18-55mm kit' } },
    ],
  },
  {
    id: 'dm_prod_skyline_drone',
    slug: 'pixelforge-skyline-4k-drone',
    title: 'Pixelforge Skyline 4K Drone',
    description:
      'Folding 249g drone with a 3-axis gimbal, 4K/60 HDR video, 34-minute flight time and omnidirectional obstacle sensing.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_imaging',
    brandId: 'dm_brand_pixelforge',
    tags: ['dm_tag_4k', 'dm_tag_portable', 'dm_tag_bestseller'],
    ratingAverage: 500,
    ratingCount: 1,
    images: [
      { id: 'dm_img_sky_1', unsplash: PHOTO.droneWater, alt: 'Skyline drone in flight over water' },
      { id: 'dm_img_sky_2', unsplash: PHOTO.droneForest, alt: 'Skyline drone hovering above a forest' },
    ],
    variants: [
      { id: 'dm_var_sky_std', sku: 'SKY-STD', price: 79900, stock: 17, weightGrams: 249, options: { Bundle: 'Standard' } },
      { id: 'dm_var_sky_fly', sku: 'SKY-FLYMORE', price: 99900, stock: 9, weightGrams: 249, options: { Bundle: 'Fly More' } },
    ],
  },
  {
    id: 'dm_prod_volt_charger',
    slug: 'volt-100w-gan-charger',
    title: 'Volt 100W GaN Charger',
    description:
      'A GaN III charger barely bigger than a matchbox. Charges a laptop, a phone and a pair of buds at once over three ports.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_power',
    brandId: 'dm_brand_volt',
    tags: ['dm_tag_fastcharge', 'dm_tag_portable', 'dm_tag_new', 'dm_tag_sale'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_chg_1', unsplash: PHOTO.charger, alt: 'Volt GaN charger with its cable coiled' },
    ],
    variants: [
      { id: 'dm_var_chg_65', sku: 'VOLT-GAN-65', price: 4999, compareAtPrice: 5999, salePrice: 3999, ...saleWindow, stock: 120, weightGrams: 140, options: { Output: '65W' } },
      { id: 'dm_var_chg_100', sku: 'VOLT-GAN-100', price: 6999, compareAtPrice: 7999, salePrice: 5499, ...saleWindow, stock: 85, weightGrams: 190, options: { Output: '100W' } },
    ],
  },
  {
    id: 'dm_prod_volt_cable',
    slug: 'volt-braided-usb-c-cable',
    title: 'Volt Braided USB-C Cable',
    description:
      'Durable braided USB-C to USB-C cable rated for 100W PD charging and 480Mbps data. 30,000-bend tested.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_power',
    brandId: 'dm_brand_volt',
    tags: ['dm_tag_fastcharge', 'dm_tag_portable'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_cab_1', unsplash: PHOTO.cableUsbc, alt: 'Volt braided USB-C cable, coiled' },
    ],
    variants: [
      { id: 'dm_var_cab_1m', sku: 'VOLT-CAB-1M', price: 1299, stock: 200, weightGrams: 40, options: { Length: '1m' } },
      { id: 'dm_var_cab_2m', sku: 'VOLT-CAB-2M', price: 1599, stock: 150, weightGrams: 70, options: { Length: '2m' } },
    ],
  },
  {
    id: 'dm_prod_corevex_mesh',
    slug: 'corevex-mesh-wifi-6-router',
    title: 'Corevex Mesh Wi-Fi 6 System',
    description:
      'Tri-band Wi-Fi 6 mesh with a dedicated backhaul, 2.5GbE WAN and seamless roaming. Covers up to 5,500 sq ft.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_networking',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_wireless', 'dm_tag_new'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_mesh_1', unsplash: PHOTO.networkPanel, alt: 'Network patch panel with ethernet cables' },
      { id: 'dm_img_mesh_2', unsplash: PHOTO.smartHome, alt: 'Corevex mesh nodes on a shelf' },
    ],
    variants: [
      { id: 'dm_var_mesh_2', sku: 'CVX-MESH-2', price: 24900, stock: 33, weightGrams: 1100, options: { Pack: '2-pack' } },
      { id: 'dm_var_mesh_3', sku: 'CVX-MESH-3', price: 32900, stock: 19, weightGrams: 1650, options: { Pack: '3-pack' } },
    ],
  },
  {
    id: 'dm_prod_corevex_deskset',
    slug: 'corevex-slim-keyboard-mouse-set',
    title: 'Corevex Slim Keyboard & Mouse Set',
    description:
      'A low-profile wireless keyboard and a contoured silent mouse sharing one USB-C receiver. Six-month battery.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_peripherals',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_wireless', 'dm_tag_portable'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_set_1', unsplash: PHOTO.keyboardSlim, alt: 'Corevex slim wireless keyboard' },
      { id: 'dm_img_set_2', unsplash: PHOTO.mouseWireless, alt: 'Corevex contoured wireless mouse' },
    ],
    variants: [
      { id: 'dm_var_set_wht', sku: 'CVX-SET-WHT', price: 8999, stock: 58, weightGrams: 690, options: { Color: 'White' } },
      { id: 'dm_var_set_gry', sku: 'CVX-SET-GRY', price: 8999, stock: 36, weightGrams: 690, options: { Color: 'Space Grey' } },
    ],
  },
  {
    id: 'dm_prod_laptop_sleeve',
    slug: 'nimbus-felt-laptop-sleeve',
    title: 'Nimbus Felt Laptop Sleeve (Discontinued)',
    description:
      'Archived product — kept to verify ARCHIVED items stay out of the storefront but remain in order history.',
    status: 'ARCHIVED',
    categoryId: 'dm_cat_peripherals',
    brandId: 'dm_brand_nimbus',
    tags: ['dm_tag_portable'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_sleeve_1', unsplash: PHOTO.laptopSleeve, alt: 'Felt laptop sleeve' },
    ],
    variants: [
      { id: 'dm_var_sleeve_13', sku: 'NIM-SLV-13', price: 3499, stock: 0, weightGrams: 180, options: { Size: '13"' } },
      { id: 'dm_var_sleeve_15', sku: 'NIM-SLV-15', price: 3499, stock: 0, weightGrams: 210, options: { Size: '15"' } },
    ],
  },
  // -- Added with the storefront redesign -----------------------------------
  // The homepage now stacks rails (featured / deals / new / one per top-level
  // category / under-$100) and each holds 12 cards. The original 20 ACTIVE
  // products left Mobile and Audio showing two or three items, so the catalog is
  // deepened here - still tech-only, still one distinct verified photo each.
  {
    id: 'dm_prod_aurora_13',
    slug: 'aurora-13-air',
    title: 'Aurora 13 Air',
    description:
      'The lightest machine we sell: 990g of milled aluminium around a 13-inch 2.8K OLED panel, a fanless 10-core CPU and a 21-hour battery. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_laptops',
    brandId: 'dm_brand_nimbus',
    tags: ['dm_tag_portable', 'dm_tag_sale', 'dm_tag_new'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_aurora13_1', unsplash: PHOTO.laptopMarble, alt: 'Aurora 13 Air open on a marble desk' },
    ],
    variants: [
      { id: 'dm_var_aurora13_8_256', sku: 'AUR13-8-256', price: 99900, compareAtPrice: 109900, salePrice: 89900, ...saleWindow, stock: 45, weightGrams: 990, options: { RAM: '8GB', Storage: '256GB' } },
      { id: 'dm_var_aurora13_16_512', sku: 'AUR13-16-512', price: 119900, compareAtPrice: 129900, salePrice: 104900, ...saleWindow, stock: 28, weightGrams: 990, options: { RAM: '16GB', Storage: '512GB' } },
    ],
  },
  {
    id: 'dm_prod_forge_mini',
    slug: 'forge-mini-pc',
    title: 'Forge Mini PC',
    description:
      'A one-litre desktop that still takes a full-height GPU. Tempered-glass side panel, three addressable fans, and it disappears under a monitor arm.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_desktops',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_gaming', 'dm_tag_rgb', 'dm_tag_portable'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_forgemini_1', unsplash: PHOTO.pcTowerBlue, alt: 'Forge Mini PC with blue-lit fans behind glass' },
    ],
    variants: [
      { id: 'dm_var_forgemini_base', sku: 'FORGE-MINI-B', price: 89900, stock: 19, weightGrams: 4800, options: { Tier: 'Base' } },
      { id: 'dm_var_forgemini_plus', sku: 'FORGE-MINI-P', price: 124900, stock: 11, weightGrams: 5100, options: { Tier: 'Plus' } },
    ],
  },
  {
    id: 'dm_prod_orbit_x5_pro',
    slug: 'orbit-x5-pro-smartphone',
    title: 'Orbit X5 Pro Smartphone',
    description:
      'The X5, taken further: a 6.9-inch 1-120Hz LTPO panel, a 1-inch main sensor, titanium frame and 90W wired charging. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_phones',
    brandId: 'dm_brand_orbit',
    tags: ['dm_tag_pro', 'dm_tag_sale', 'dm_tag_bestseller'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_x5pro_1', unsplash: PHOTO.phoneTabletDark, alt: 'Orbit X5 Pro beside a tablet on a dark surface' },
    ],
    variants: [
      { id: 'dm_var_x5pro_256', sku: 'ORB-X5P-256', price: 119900, compareAtPrice: 129900, salePrice: 109900, ...saleWindow, stock: 31, weightGrams: 221, options: { Storage: '256GB' } },
      { id: 'dm_var_x5pro_512', sku: 'ORB-X5P-512', price: 134900, compareAtPrice: 144900, salePrice: 124900, ...saleWindow, stock: 17, weightGrams: 221, options: { Storage: '512GB' } },
    ],
  },
  {
    id: 'dm_prod_orbit_tab',
    slug: 'orbit-tab-11',
    title: 'Orbit Tab 11',
    description:
      'An 11-inch 144Hz tablet with pen support and a magnetic keyboard folio. Runs the same desktop-class chip as the X5 Pro.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_tablets',
    brandId: 'dm_brand_orbit',
    tags: ['dm_tag_new', 'dm_tag_portable', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_tab_1', unsplash: PHOTO.tabletPair, alt: 'Orbit Tab 11 in two sizes on a white desk' },
    ],
    variants: [
      { id: 'dm_var_tab_128', sku: 'ORB-TAB-128', price: 54900, stock: 62, weightGrams: 480, options: { Storage: '128GB' } },
      { id: 'dm_var_tab_256', sku: 'ORB-TAB-256', price: 64900, stock: 38, weightGrams: 480, options: { Storage: '256GB' } },
    ],
  },
  {
    id: 'dm_prod_aether_studio',
    slug: 'aether-studio-one-headphones',
    title: 'Aether Studio One Headphones',
    description:
      'Open-back reference headphones with 40mm beryllium-coated drivers and lambskin earpads. Wired only - built for mixing, not commuting.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_headphones',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_pro', 'dm_tag_bestseller'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_studio_1', unsplash: PHOTO.headphonesTan, alt: 'Aether Studio One on-ear headphones in tan and silver' },
    ],
    variants: [
      { id: 'dm_var_studio_tan', sku: 'AET-ST1-TAN', price: 24900, stock: 24, weightGrams: 320, options: { Color: 'Tan' } },
    ],
  },
  {
    id: 'dm_prod_aether_air',
    slug: 'aether-air-earbuds',
    title: 'Aether Air Earbuds',
    description:
      'Featherweight open-fit buds for long days - 7 hours a charge, 28 with the case, and a transparency mode you can leave on. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_headphones',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_wireless', 'dm_tag_sale', 'dm_tag_portable', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_air_1', unsplash: PHOTO.earbudsMinimal, alt: 'Aether Air earbuds beside their charging case' },
    ],
    variants: [
      { id: 'dm_var_air_wht', sku: 'AET-AIR-WHT', price: 7999, compareAtPrice: 9999, salePrice: 5999, ...saleWindow, stock: 140, weightGrams: 45, options: { Color: 'White' } },
    ],
  },
  {
    id: 'dm_prod_aether_hue',
    slug: 'aether-hue-on-ear',
    title: 'Aether Hue On-Ear',
    description:
      'The colour-first pair: six finishes, 35-hour battery, and a folding hinge that survives being thrown in a bag. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_headphones',
    brandId: 'dm_brand_aether',
    tags: ['dm_tag_wireless', 'dm_tag_sale', 'dm_tag_gift'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_hue_1', unsplash: PHOTO.headphonesPastel, alt: 'Aether Hue headphones in pink on a pastel background' },
    ],
    variants: [
      { id: 'dm_var_hue_pink', sku: 'AET-HUE-PNK', price: 5999, compareAtPrice: 7999, salePrice: 4499, ...saleWindow, stock: 96, weightGrams: 190, options: { Color: 'Blush' } },
      { id: 'dm_var_hue_mint', sku: 'AET-HUE-MNT', price: 5999, compareAtPrice: 7999, salePrice: 4499, ...saleWindow, stock: 74, weightGrams: 190, options: { Color: 'Mint' } },
    ],
  },
  {
    id: 'dm_prod_kryon_halo',
    slug: 'kryon-halo-rgb-keyboard',
    title: 'Kryon Halo RGB Keyboard',
    description:
      'Full-size, low-profile optical switches with 0.2ms actuation and per-key lighting that runs off the board, not a driver. **On sale this week.**',
    status: 'ACTIVE',
    categoryId: 'dm_cat_gaminggear',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_rgb', 'dm_tag_sale'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_halo_1', unsplash: PHOTO.keyboardBacklit, alt: 'Kryon Halo keyboard with blue backlighting' },
    ],
    variants: [
      { id: 'dm_var_halo_opt', sku: 'KRY-HALO-OPT', price: 15900, compareAtPrice: 17900, salePrice: 12900, ...saleWindow, stock: 48, weightGrams: 960, options: { Switch: 'Optical Linear' } },
    ],
  },
  {
    id: 'dm_prod_kryon_arena',
    slug: 'kryon-arena-battlestation-bundle',
    title: 'Kryon Arena Battlestation Bundle',
    description:
      'Keyboard, mouse, controller and desk mat in one box, colour-matched and pre-paired. The whole desk, sorted in a single order.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_gaminggear',
    brandId: 'dm_brand_kryon',
    tags: ['dm_tag_gaming', 'dm_tag_rgb', 'dm_tag_gift', 'dm_tag_bestseller'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_arena_1', unsplash: PHOTO.gamingDeskRgb, alt: 'Kryon Arena bundle laid out on a desk mat' },
    ],
    variants: [
      { id: 'dm_var_arena_std', sku: 'KRY-ARENA-STD', price: 27900, compareAtPrice: 32900, stock: 22, weightGrams: 3400, options: { Edition: 'Standard' } },
    ],
  },
  {
    id: 'dm_prod_corevex_office_kb',
    slug: 'corevex-office-keyboard',
    title: 'Corevex Office Keyboard',
    description:
      'A quiet, full-size membrane board for shared offices. Spill channels, a two-year battery, and it pairs with three machines at once.',
    status: 'ACTIVE',
    categoryId: 'dm_cat_peripherals',
    brandId: 'dm_brand_corevex',
    tags: ['dm_tag_wireless'],
    ratingAverage: 0,
    ratingCount: 0,
    images: [
      { id: 'dm_img_officekb_1', unsplash: PHOTO.keyboardWhiteFlat, alt: 'Corevex office keyboard, top-down on white' },
    ],
    variants: [
      { id: 'dm_var_officekb_wht', sku: 'CVX-OKB-WHT', price: 3999, stock: 180, weightGrams: 700, options: { Color: 'White' } },
    ],
  },
];

const CUSTOMERS = [
  { handle: 'alice', firstName: 'Alice', lastName: 'Nguyen', email: 'alice@example.com', gender: 'female', status: 'ACTIVE' as const },
  { handle: 'bob', firstName: 'Bob', lastName: 'Martinez', email: 'bob@example.com', gender: 'male', status: 'ACTIVE' as const },
  { handle: 'carol', firstName: 'Carol', lastName: 'Smith', email: 'carol@example.com', gender: 'female', status: 'ACTIVE' as const },
  { handle: 'david', firstName: 'David', lastName: 'Lee', email: 'david@example.com', gender: 'male', status: 'BANNED' as const },
];

// ─────────────────────────── main ───────────────────────────

async function main() {
  console.log('🌱 Seeding demo data…\n');

  // 0. Store settings + admin (idempotent, production-safe helpers).
  await prisma.storeSetting.upsert({
    where: { singleton: true },
    update: {
      name: 'Techistan',
      contactEmail: 'support@techistan.dev',
      socials: { twitter: 'https://twitter.com/techistan', instagram: 'https://instagram.com/techistan' },
    },
    create: {
      singleton: true,
      name: 'Techistan',
      currency: 'USD',
      contactEmail: 'support@techistan.dev',
      lowStockThreshold: 5,
      taxRules: { US: { rate: 700 }, default: { rate: 0 } }, // rate is basis points (700 = 7%)
      shippingZones: {
        US: { flatRate: 599, freeOver: 15000 },
        INTL: { flatRate: 1999, freeOver: 30000 },
      },
      socials: { twitter: 'https://twitter.com/techistan', instagram: 'https://instagram.com/techistan' },
    },
  });
  await seedAdmin(prisma);

  const demoCatIds = CATEGORIES.map((c) => c.id);
  const demoProdIds = PRODUCTS.map((p) => p.id);
  const demoProdSlugs = PRODUCTS.map((p) => p.slug);
  const demoVarIds = PRODUCTS.flatMap((p) => p.variants.map((v) => v.id));
  const demoVarSkus = PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku));
  const demoBrandIds = BRANDS.map((b) => b.id);
  const demoTagIds = TAGS.map((t) => t.id);

  // 0b. Prune demo rows this file no longer defines. Everything this seed owns
  // is `dm_*`-prefixed, so scoping the deletes to that prefix can never touch
  // real data — but it DOES clear out a previous catalog (e.g. the apparel demo
  // this file used to seed) so the demo dataset always matches this file.
  // Orders are pruned first: OrderItem.variantId is SetNull, so a stale order
  // would otherwise survive as a ghost with no product behind it.
  const dm = { startsWith: 'dm_' };
  await prisma.order.deleteMany({ where: { id: dm } }); // cascades items/payments/notes/returns/redemptions
  await prisma.cart.deleteMany({ where: { id: dm } }); // cascades cart items
  await prisma.review.deleteMany({ where: { id: dm } }); // cascades images/votes
  await prisma.product.deleteMany({ where: { id: dm, NOT: { id: { in: demoProdIds } } } });
  await prisma.productVariant.deleteMany({ where: { id: dm, NOT: { id: { in: demoVarIds } } } });
  await prisma.category.deleteMany({ where: { id: dm, NOT: { id: { in: demoCatIds } } } });
  await prisma.brand.deleteMany({ where: { id: dm, NOT: { id: { in: demoBrandIds } } } });
  await prisma.tag.deleteMany({ where: { id: dm, NOT: { id: { in: demoTagIds } } } });
  await prisma.mediaAsset.deleteMany({ where: { id: dm } });
  await prisma.coupon.deleteMany({ where: { id: dm } }); // cascades redemptions
  await prisma.automaticDiscount.deleteMany({ where: { id: dm } });
  await prisma.notification.deleteMany({ where: { id: dm } });

  // 0c. Reconcile with the minimal `prisma db seed` sample rows and any prior
  // partial run, so our explicit-id upserts never collide on a unique slug/sku.
  // We only ever delete rows that share our slug/sku but are NOT our own ids.
  await prisma.product.deleteMany({ where: { slug: 'anc-over-ear-headphones' } }); // base sample (cascades its variant)
  await prisma.product.deleteMany({ where: { slug: { in: demoProdSlugs }, id: { notIn: demoProdIds } } });
  await prisma.productVariant.deleteMany({ where: { sku: { in: demoVarSkus }, id: { notIn: demoVarIds } } });
  await prisma.category.deleteMany({ where: { slug: { in: CATEGORIES.map((c) => c.slug) }, id: { notIn: demoCatIds } } });

  // 1. Brands
  for (const b of BRANDS) {
    await prisma.brand.upsert({ where: { id: b.id }, update: { name: b.name, slug: b.slug }, create: b });
  }

  // 2. Categories (parents first — array is already ordered so parents precede children)
  for (const c of CATEGORIES) {
    const data = { name: c.name, slug: c.slug, parentId: c.parentId, sortOrder: c.sortOrder, imageUrl: img(c.img) };
    await prisma.category.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }

  // 3. Tags
  for (const t of TAGS) {
    await prisma.tag.upsert({ where: { id: t.id }, update: { name: t.name, slug: t.slug }, create: t });
  }

  // 4. Products + variants + images + tag links
  for (const p of PRODUCTS) {
    const base = {
      title: p.title,
      slug: p.slug,
      description: p.description,
      status: p.status,
      categoryId: p.categoryId,
      brandId: p.brandId,
      metaTitle: p.title,
      metaDescription: p.description.replace(/\*/g, '').slice(0, 155),
      ogImage: img(p.images[0].unsplash),
      ratingAverage: p.ratingAverage,
      ratingCount: p.ratingCount,
    };
    await prisma.product.upsert({ where: { id: p.id }, update: base, create: { id: p.id, ...base } });

    for (const [i, im] of p.images.entries()) {
      const idata = {
        productId: p.id,
        cloudinaryPublicId: `techistan/demo/${im.id}`,
        url: img(im.unsplash),
        alt: im.alt,
        position: i,
        width: 1000,
        height: 1000,
      };
      await prisma.productImage.upsert({ where: { id: im.id }, update: idata, create: { id: im.id, ...idata } });
    }

    for (const v of p.variants) {
      const vdata = {
        productId: p.id,
        sku: v.sku,
        price: v.price,
        compareAtPrice: v.compareAtPrice ?? null,
        salePrice: v.salePrice ?? null,
        saleStartsAt: v.saleStartsAt ?? null,
        saleEndsAt: v.saleEndsAt ?? null,
        stock: v.stock,
        weightGrams: v.weightGrams ?? null,
        options: v.options,
      };
      await prisma.productVariant.upsert({ where: { id: v.id }, update: vdata, create: { id: v.id, ...vdata } });
    }

    for (const tagId of p.tags) {
      await prisma.productTag.upsert({
        where: { productId_tagId: { productId: p.id, tagId } },
        update: {},
        create: { productId: p.id, tagId },
      });
    }
  }

  // 5. Customers (Int id — key by email) + addresses
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  const userIds: Record<string, number> = {};
  for (const c of CUSTOMERS) {
    const u = await prisma.user.upsert({
      where: { email: c.email },
      update: { status: c.status },
      create: {
        firstName: c.firstName,
        lastName: c.lastName,
        email: c.email,
        password: passwordHash,
        provider: 'LOCAL',
        role: Role.CUSTOMER,
        status: c.status,
        gender: c.gender,
        emailVerified: daysAgo(30),
        profilePhoto: `https://i.pravatar.cc/200?u=${c.email}`,
      },
    });
    userIds[c.handle] = u.id;
  }

  const ADDRESSES = [
    { id: 'dm_addr_alice_ship', handle: 'alice', type: 'SHIPPING', label: 'Home', fullName: 'Alice Nguyen', phone: '+1-415-555-0111', line1: '742 Evergreen Terrace', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'US', isDefault: true },
    { id: 'dm_addr_alice_bill', handle: 'alice', type: 'BILLING', label: 'Home', fullName: 'Alice Nguyen', phone: '+1-415-555-0111', line1: '742 Evergreen Terrace', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'US', isDefault: true },
    { id: 'dm_addr_bob_ship', handle: 'bob', type: 'SHIPPING', label: 'Home', fullName: 'Bob Martinez', phone: '+1-512-555-0122', line1: '1200 Congress Ave', line2: 'Apt 4B', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US', isDefault: true },
    { id: 'dm_addr_carol_ship', handle: 'carol', type: 'SHIPPING', label: 'Work', fullName: 'Carol Smith', phone: '+1-212-555-0133', line1: '30 Rockefeller Plaza', city: 'New York', state: 'NY', postalCode: '10112', country: 'US', isDefault: true },
    { id: 'dm_addr_david_ship', handle: 'david', type: 'SHIPPING', label: 'Home', fullName: 'David Lee', phone: '+1-206-555-0144', line1: '400 Broad St', city: 'Seattle', state: 'WA', postalCode: '98109', country: 'US', isDefault: true },
  ];
  for (const a of ADDRESSES) {
    const { handle, ...rest } = a;
    const data = { ...rest, userId: userIds[handle], type: rest.type as 'SHIPPING' | 'BILLING' };
    await prisma.address.upsert({ where: { id: a.id }, update: data, create: data });
  }

  // Reusable address snapshots for orders (Json)
  const addrSnap = {
    alice: { fullName: 'Alice Nguyen', phone: '+1-415-555-0111', line1: '742 Evergreen Terrace', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'US' },
    bob: { fullName: 'Bob Martinez', phone: '+1-512-555-0122', line1: '1200 Congress Ave', line2: 'Apt 4B', city: 'Austin', state: 'TX', postalCode: '78701', country: 'US' },
    carol: { fullName: 'Carol Smith', phone: '+1-212-555-0133', line1: '30 Rockefeller Plaza', city: 'New York', state: 'NY', postalCode: '10112', country: 'US' },
    david: { fullName: 'David Lee', phone: '+1-206-555-0144', line1: '400 Broad St', city: 'Seattle', state: 'WA', postalCode: '98109', country: 'US' },
    guest: { fullName: 'Guest Shopper', phone: '+1-305-555-0199', line1: '888 Ocean Dr', city: 'Miami', state: 'FL', postalCode: '33139', country: 'US' },
  };

  // 6. Carts — one active signed-in cart (Alice) + one guest cart (recovery testing)
  await prisma.cart.upsert({
    where: { userId: userIds.alice },
    update: {},
    create: { id: 'dm_cart_alice', userId: userIds.alice, updatedAt: daysAgo(1) },
  });
  const aliceCartItems = [
    { id: 'dm_ci_alice_1', variantId: 'dm_var_anc_blk', productId: 'dm_prod_aether_anc', quantity: 1, unitPriceCents: 19999 },
    { id: 'dm_ci_alice_2', variantId: 'dm_var_kbd_brown', productId: 'dm_prod_kryon_keyboard', quantity: 2, unitPriceCents: 12900 },
  ];
  for (const ci of aliceCartItems) {
    await prisma.cartItem.upsert({
      where: { cartId_variantId: { cartId: 'dm_cart_alice', variantId: ci.variantId } },
      update: { quantity: ci.quantity, unitPriceCents: ci.unitPriceCents },
      create: { cartId: 'dm_cart_alice', ...ci },
    });
  }

  // Guest cart abandoned ~2h ago with a captured email (drives abandoned-cart recovery, script 16)
  await prisma.cart.upsert({
    where: { sessionId: 'dm_guest_session_abandoned' },
    update: {},
    create: {
      id: 'dm_cart_guest',
      sessionId: 'dm_guest_session_abandoned',
      guestEmail: 'window.shopper@example.com',
      recoveryStage: 0,
      updatedAt: new Date(now.getTime() - 2 * 3_600_000),
    },
  });
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: 'dm_cart_guest', variantId: 'dm_var_drift_wht' } },
    update: { quantity: 1, unitPriceCents: 9999 },
    create: { id: 'dm_ci_guest_1', cartId: 'dm_cart_guest', productId: 'dm_prod_aether_drift', variantId: 'dm_var_drift_wht', quantity: 1, unitPriceCents: 9999 },
  });

  // 7. Wishlist + recently-viewed
  const wishlist = [
    { userId: userIds.alice, productId: 'dm_prod_aurora_14' },
    { userId: userIds.alice, productId: 'dm_prod_skyline_drone' },
    { userId: userIds.bob, productId: 'dm_prod_orbit_x5' },
    { userId: userIds.carol, productId: 'dm_prod_orbit_pulse' },
  ];
  for (const w of wishlist) {
    await prisma.wishlistItem.upsert({
      where: { userId_productId: w },
      update: {},
      create: w,
    });
  }
  const recentlyViewed = [
    { userId: userIds.alice, productId: 'dm_prod_aether_anc', viewedAt: daysAgo(0) },
    { userId: userIds.alice, productId: 'dm_prod_aurora_14', viewedAt: daysAgo(1) },
    { userId: userIds.alice, productId: 'dm_prod_kryon_keyboard', viewedAt: daysAgo(2) },
    { userId: userIds.bob, productId: 'dm_prod_orbit_x5', viewedAt: daysAgo(1) },
  ];
  for (const r of recentlyViewed) {
    await prisma.recentlyViewed.upsert({
      where: { userId_productId: { userId: r.userId, productId: r.productId } },
      update: { viewedAt: r.viewedAt },
      create: r,
    });
  }

  // 8. Coupons + automatic discount
  const COUPONS = [
    { id: 'dm_coupon_welcome', code: 'TECH10', type: 'PERCENT', value: 10, minOrder: 2000, maxDiscount: 5000, usageLimit: 1000, perCustomerLimit: 1, usedCount: 1, startsAt: daysAgo(60), expiresAt: daysFromNow(60), active: true },
    { id: 'dm_coupon_save15', code: 'SAVE15', type: 'FIXED', value: 1500, minOrder: 7500, usageLimit: 500, perCustomerLimit: 3, usedCount: 0, startsAt: daysAgo(30), expiresAt: daysFromNow(30), active: true },
    { id: 'dm_coupon_freeship', code: 'FREESHIP', type: 'FREE_SHIPPING', value: 0, minOrder: 5000, usageLimit: null, perCustomerLimit: null, usedCount: 0, startsAt: daysAgo(10), expiresAt: daysFromNow(20), active: true },
    { id: 'dm_coupon_expired', code: 'BACKTOSCHOOL', type: 'PERCENT', value: 20, minOrder: 0, maxDiscount: 10000, usageLimit: 1000, perCustomerLimit: 1, usedCount: 342, startsAt: daysAgo(120), expiresAt: daysAgo(30), active: true },
    { id: 'dm_coupon_scheduled', code: 'BLACKFRIDAY', type: 'PERCENT', value: 30, minOrder: 0, maxDiscount: 20000, usageLimit: 5000, perCustomerLimit: 1, usedCount: 0, startsAt: daysFromNow(30), expiresAt: daysFromNow(34), active: true },
  ];
  for (const c of COUPONS) {
    const { id, ...rest } = c;
    await prisma.coupon.upsert({
      where: { id },
      update: rest as any,
      create: { id, ...rest } as any,
    });
  }
  await prisma.automaticDiscount.upsert({
    where: { id: 'dm_autodisc_spend' },
    update: {},
    create: {
      id: 'dm_autodisc_spend',
      name: 'Spend $250, get 10% off',
      rule: { minSubtotal: 25000, percentOff: 10 },
      priority: 10,
      status: 'ACTIVE',
      startsAt: daysAgo(15),
      endsAt: daysFromNow(45),
    },
  });

  // 9. Orders across every status (+ items, payments, shipment events, notes, returns, redemptions)
  const adminId = (await prisma.user.findUnique({ where: { email: process.env.ADMIN_EMAIL } }))?.id ?? null;
  const ORDERS = [
    {
      id: 'dm_ord_1', orderNumber: 'ORD-20260710-0001', handle: 'alice', status: 'COMPLETED', payStatus: 'SUCCEEDED', createdAt: daysAgo(13),
      items: [
        { id: 'dm_oi_1a', variantId: 'dm_var_anc_blk', productTitle: 'Aether ANC Over-Ear Headphones', variantOptions: { Color: 'Black' }, sku: 'AANC-BLK', quantity: 1, unitPrice: 19999 },
        { id: 'dm_oi_1b', variantId: 'dm_var_aurora_16_512', productTitle: 'Aurora 14 Ultrabook', variantOptions: { RAM: '16GB', Storage: '512GB' }, sku: 'AUR14-16-512', quantity: 1, unitPrice: 114900 },
      ],
      shipping: 0, discount: 0, couponCode: null,
      shipmentEvents: [
        { id: 'dm_se_1a', status: 'CONFIRMED', occurredAt: daysAgo(13) },
        { id: 'dm_se_1b', status: 'SHIPPED', carrier: 'UPS', trackingNumber: '1Z999AA10123456784', trackingUrl: 'https://www.ups.com/track?tracknum=1Z999AA10123456784', occurredAt: daysAgo(11) },
        { id: 'dm_se_1c', status: 'DELIVERED', carrier: 'UPS', occurredAt: daysAgo(9) },
      ],
      notes: [
        { id: 'dm_on_1a', body: 'Customer asked for the laptop to be shipped in a plain box.', visibility: 'INTERNAL', authorId: adminId },
        { id: 'dm_on_1b', body: 'Your order has been delivered — enjoy!', visibility: 'CUSTOMER', authorId: adminId },
      ],
    },
    {
      id: 'dm_ord_2', orderNumber: 'ORD-20260718-0002', handle: 'bob', status: 'SHIPPED', payStatus: 'SUCCEEDED', createdAt: daysAgo(5),
      items: [
        { id: 'dm_oi_2a', variantId: 'dm_var_x5_256_mid', productTitle: 'Orbit X5 Smartphone', variantOptions: { Storage: '256GB', Color: 'Midnight' }, sku: 'X5-256-MID', quantity: 1, unitPrice: 99900 },
        { id: 'dm_oi_2b', variantId: 'dm_var_chg_100', productTitle: 'Volt 100W GaN Charger', variantOptions: { Output: '100W' }, sku: 'VOLT-GAN-100', quantity: 1, unitPrice: 6999 },
      ],
      shipping: 599, discount: 0, couponCode: null,
      shipmentEvents: [
        { id: 'dm_se_2a', status: 'CONFIRMED', occurredAt: daysAgo(5) },
        { id: 'dm_se_2b', status: 'SHIPPED', carrier: 'FedEx', trackingNumber: '772890123456', trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=772890123456', occurredAt: daysAgo(3) },
      ],
      notes: [],
    },
    {
      id: 'dm_ord_3', orderNumber: 'ORD-20260721-0003', handle: 'carol', status: 'PROCESSING', payStatus: 'SUCCEEDED', createdAt: daysAgo(2),
      items: [
        { id: 'dm_oi_3a', variantId: 'dm_var_kbd_red', productTitle: 'Kryon Tactile Mechanical Keyboard', variantOptions: { Switch: 'Linear Red' }, sku: 'KRY-KB-RED', quantity: 1, unitPrice: 12900 },
        { id: 'dm_oi_3b', variantId: 'dm_var_mouse_blk', productTitle: 'Kryon Lightspeed Gaming Mouse', variantOptions: { Color: 'Black' }, sku: 'KRY-MS-BLK', quantity: 1, unitPrice: 7900 },
      ],
      shipping: 599, discount: 2080, couponCode: 'TECH10', redemption: { id: 'dm_red_3', couponId: 'dm_coupon_welcome' },
      shipmentEvents: [{ id: 'dm_se_3a', status: 'CONFIRMED', occurredAt: daysAgo(2) }],
      notes: [{ id: 'dm_on_3a', body: 'Packing in progress.', visibility: 'INTERNAL', authorId: adminId }],
    },
    {
      id: 'dm_ord_4', orderNumber: 'ORD-20260722-0004', handle: 'guest', status: 'PENDING', payStatus: 'REQUIRES_PAYMENT', createdAt: daysAgo(1), email: 'guest.shopper@example.com',
      items: [
        { id: 'dm_oi_4a', variantId: 'dm_var_cab_2m', productTitle: 'Volt Braided USB-C Cable', variantOptions: { Length: '2m' }, sku: 'VOLT-CAB-2M', quantity: 2, unitPrice: 1599 },
      ],
      shipping: 599, discount: 0, couponCode: null,
      shipmentEvents: [], notes: [],
    },
    {
      id: 'dm_ord_5', orderNumber: 'ORD-20260705-0005', handle: 'david', status: 'REFUNDED', payStatus: 'REFUNDED', createdAt: daysAgo(18),
      items: [
        { id: 'dm_oi_5a', variantId: 'dm_var_drift_wht', productTitle: 'Aether Drift Wireless Earbuds', variantOptions: { Color: 'White' }, sku: 'DRIFT-WHT', quantity: 1, unitPrice: 9999 },
      ],
      shipping: 599, discount: 0, couponCode: null,
      shipmentEvents: [
        { id: 'dm_se_5a', status: 'CONFIRMED', occurredAt: daysAgo(18) },
        { id: 'dm_se_5b', status: 'DELIVERED', occurredAt: daysAgo(14) },
      ],
      notes: [{ id: 'dm_on_5a', body: 'Refund issued — left earbud would not charge.', visibility: 'CUSTOMER', authorId: adminId }],
      return: { id: 'dm_ret_5', reasonCode: 'DEFECTIVE', status: 'COMPLETED', note: 'Left earbud not charging.', refundAmount: 11298 },
      fullRefund: true,
    },
    {
      id: 'dm_ord_6', orderNumber: 'ORD-20260708-0006', handle: 'alice', status: 'CANCELLED', payStatus: 'FAILED', createdAt: daysAgo(15),
      items: [
        { id: 'dm_oi_6a', variantId: 'dm_var_nova_1t', productTitle: 'Nova Play Console', variantOptions: { Storage: '1TB' }, sku: 'NOVA-1T', quantity: 1, unitPrice: 49900 },
      ],
      shipping: 599, discount: 0, couponCode: null,
      shipmentEvents: [], notes: [{ id: 'dm_on_6a', body: 'Payment failed twice; order auto-cancelled.', visibility: 'INTERNAL', authorId: adminId }],
    },
  ] as const;

  for (const o of ORDERS) {
    const subtotal = o.items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);
    const taxTotal = tax(subtotal - (o.discount ?? 0));
    const grandTotal = subtotal + o.shipping + taxTotal - (o.discount ?? 0);
    const email = 'email' in o && o.email ? o.email : CUSTOMERS.find((c) => c.handle === o.handle)!.email;
    const userId = o.handle === 'guest' ? null : userIds[o.handle];
    const snap = (addrSnap as any)[o.handle];

    const orderData = {
      orderNumber: o.orderNumber,
      userId,
      email,
      status: o.status as any,
      subtotal,
      shippingTotal: o.shipping,
      taxTotal,
      discountTotal: o.discount ?? 0,
      grandTotal,
      currency: 'USD',
      shippingAddress: snap,
      billingAddress: snap,
      couponCode: o.couponCode ?? null,
      createdAt: o.createdAt,
    };
    await prisma.order.upsert({ where: { id: o.id }, update: orderData, create: { id: o.id, ...orderData } });

    for (const it of o.items) {
      const idata = {
        orderId: o.id,
        variantId: it.variantId,
        productTitle: it.productTitle,
        variantOptions: it.variantOptions,
        sku: it.sku,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.unitPrice * it.quantity,
      };
      await prisma.orderItem.upsert({ where: { id: it.id }, update: idata, create: { id: it.id, ...idata } });
    }

    // Payment
    const payId = `dm_pay_${o.id}`;
    const refunded = 'fullRefund' in o && o.fullRefund ? grandTotal : 0;
    const pdata = {
      orderId: o.id,
      stripePaymentIntentId: `pi_demo_${o.id}`,
      amount: grandTotal,
      refundedAmount: refunded,
      currency: 'USD',
      status: o.payStatus as any,
      method: o.payStatus === 'REQUIRES_PAYMENT' ? null : 'card',
    };
    await prisma.payment.upsert({ where: { id: payId }, update: pdata, create: { id: payId, ...pdata } });

    for (const se of o.shipmentEvents ?? []) {
      const sdata = { orderId: o.id, ...se };
      await prisma.shipmentEvent.upsert({ where: { id: se.id }, update: sdata, create: sdata });
    }
    for (const n of o.notes ?? []) {
      const ndata = { orderId: o.id, body: n.body, visibility: n.visibility as any, authorId: n.authorId };
      await prisma.orderNote.upsert({ where: { id: n.id }, update: ndata, create: { id: n.id, ...ndata } });
    }
    if ('redemption' in o && o.redemption) {
      await prisma.couponRedemption.upsert({
        where: { couponId_orderId: { couponId: o.redemption.couponId, orderId: o.id } },
        update: { discountCents: o.discount ?? 0 },
        create: { id: o.redemption.id, couponId: o.redemption.couponId, orderId: o.id, userId, discountCents: o.discount ?? 0 },
      });
    }
    if ('return' in o && o.return) {
      const rdata = {
        orderId: o.id,
        reasonCode: o.return.reasonCode,
        status: o.return.status as any,
        note: o.return.note,
        refundAmount: o.return.refundAmount,
        items: o.items.map((it) => ({ orderItemId: it.id, sku: it.sku, productTitle: it.productTitle, quantity: it.quantity, unitPrice: it.unitPrice })),
      };
      await prisma.returnRequest.upsert({ where: { id: o.return.id }, update: rdata, create: { id: o.return.id, ...rdata } });
    }
  }

  // 10. Reviews (approved drive the product ratingAverage/ratingCount set above) + images + votes
  const REVIEWS = [
    { id: 'dm_rev_1', productId: 'dm_prod_aether_anc', handle: 'alice', orderId: 'dm_ord_1', rating: 5, title: 'The ANC is the real deal', body: 'Cuts engine noise on a long-haul flight almost completely. Battery easily lasts a week of commuting.', status: 'APPROVED', helpfulCount: 11, images: [{ id: 'dm_revimg_1', unsplash: PHOTO.headphonesDetail }] },
    { id: 'dm_rev_2', productId: 'dm_prod_aether_anc', handle: 'bob', orderId: null, rating: 4, title: 'Great, slightly tight clamp', body: 'Sound is excellent for the money. Took a few days to loosen up on my head.', status: 'APPROVED', helpfulCount: 4, images: [] },
    { id: 'dm_rev_3', productId: 'dm_prod_aurora_14', handle: 'alice', orderId: 'dm_ord_1', rating: 5, title: 'Genuinely all-day battery', body: 'Two full work days between charges and it never gets hot. The OLED panel is gorgeous.', status: 'APPROVED', helpfulCount: 9, images: [] },
    { id: 'dm_rev_4', productId: 'dm_prod_aurora_14', handle: 'david', orderId: null, rating: 4, title: 'Fast, but only two ports', body: 'Blazing quick and beautifully built. I do miss having a USB-A port.', status: 'APPROVED', helpfulCount: 3, images: [] },
    { id: 'dm_rev_5', productId: 'dm_prod_aurora_14', handle: 'bob', orderId: null, rating: 3, title: 'Waiting on my unit', body: 'Awaiting moderation — pending review for testing the queue.', status: 'PENDING', helpfulCount: 0, images: [] },
    { id: 'dm_rev_6', productId: 'dm_prod_orbit_x5', handle: 'carol', orderId: null, rating: 5, title: 'Camera punches above its price', body: 'Night mode is shockingly good and it charges from flat in under an hour.', status: 'APPROVED', helpfulCount: 6, images: [{ id: 'dm_revimg_6', unsplash: PHOTO.phoneCamera }] },
    { id: 'dm_rev_7', productId: 'dm_prod_orbit_x5', handle: 'bob', orderId: 'dm_ord_2', rating: 4, title: 'Great phone, average speakers', body: 'Screen and battery are superb. Speakers are a bit thin at volume.', status: 'APPROVED', helpfulCount: 2, images: [] },
    { id: 'dm_rev_8', productId: 'dm_prod_kryon_keyboard', handle: 'carol', orderId: 'dm_ord_3', rating: 5, title: 'Sounds incredible out of the box', body: 'The gasket mount makes it sound like a much more expensive board. Swapped switches in ten minutes.', status: 'APPROVED', helpfulCount: 7, images: [] },
    { id: 'dm_rev_9', productId: 'dm_prod_skyline_drone', handle: 'bob', orderId: null, rating: 5, title: 'Under 250g and it shows', body: 'No registration needed and it still holds position in real wind. Footage is stable straight off the card.', status: 'APPROVED', helpfulCount: 5, images: [] },
    { id: 'dm_rev_10', productId: 'dm_prod_aether_drift', handle: 'alice', orderId: null, rating: 2, title: 'Case arrived scratched', body: 'Rejected sample — used to test the rejected state.', status: 'REJECTED', helpfulCount: 0, images: [] },
  ];
  for (const rv of REVIEWS) {
    const rdata = {
      productId: rv.productId,
      userId: userIds[rv.handle],
      orderId: rv.orderId,
      rating: rv.rating,
      title: rv.title,
      body: rv.body,
      status: rv.status as any,
      helpfulCount: rv.helpfulCount,
    };
    await prisma.review.upsert({ where: { id: rv.id }, update: rdata, create: { id: rv.id, ...rdata } });
    for (const im of rv.images) {
      const idata = { reviewId: rv.id, cloudinaryPublicId: `techistan/demo/reviews/${im.id}`, url: img(im.unsplash), alt: `${rv.title} — customer photo` };
      await prisma.reviewImage.upsert({ where: { id: im.id }, update: idata, create: { id: im.id, ...idata } });
    }
  }
  // Helpful votes (idempotent by unique reviewId+userId)
  const VOTES = [
    { reviewId: 'dm_rev_1', handle: 'bob' },
    { reviewId: 'dm_rev_1', handle: 'carol' },
    { reviewId: 'dm_rev_3', handle: 'bob' },
    { reviewId: 'dm_rev_3', handle: 'carol' },
    { reviewId: 'dm_rev_3', handle: 'david' },
  ];
  for (const v of VOTES) {
    await prisma.reviewVote.upsert({
      where: { reviewId_userId: { reviewId: v.reviewId, userId: userIds[v.handle] } },
      update: {},
      create: { reviewId: v.reviewId, userId: userIds[v.handle] },
    });
  }

  // 11. Notifications for Alice
  const NOTIFICATIONS = [
    { id: 'dm_notif_1', handle: 'alice', type: 'ORDER_DELIVERED', title: 'Order delivered', body: 'ORD-20260710-0001 was delivered.', readAt: daysAgo(9), createdAt: daysAgo(9) },
    { id: 'dm_notif_2', handle: 'alice', type: 'PRICE_DROP', title: 'Price drop in your wishlist', body: 'Aurora 14 Ultrabook is now on sale.', readAt: null, createdAt: daysAgo(4) },
    { id: 'dm_notif_3', handle: 'alice', type: 'REVIEW_APPROVED', title: 'Your review is live', body: 'Thanks for reviewing the Aether ANC Over-Ear Headphones.', readAt: null, createdAt: daysAgo(8) },
  ];
  for (const n of NOTIFICATIONS) {
    const ndata = { userId: userIds[n.handle], type: n.type, title: n.title, body: n.body, readAt: n.readAt, createdAt: n.createdAt };
    await prisma.notification.upsert({ where: { id: n.id }, update: ndata, create: { id: n.id, ...ndata } });
  }

  // 12. Media library assets (unattached — for the admin media picker)
  const MEDIA = [
    { id: 'dm_media_1', unsplash: PHOTO.deskFlatlay, alt: 'Workspace banner', folder: 'techistan/banners' },
    { id: 'dm_media_2', unsplash: PHOTO.esports, alt: 'Gaming setup hero', folder: 'techistan/marketing' },
    { id: 'dm_media_3', unsplash: PHOTO.smartHome, alt: 'Smart home lifestyle', folder: 'techistan/marketing' },
  ];
  for (const m of MEDIA) {
    const mdata = { cloudinaryPublicId: `techistan/demo/${m.id}`, url: img(m.unsplash), format: 'jpg', width: 1000, height: 1000, bytes: 245_000, alt: m.alt, folder: m.folder };
    await prisma.mediaAsset.upsert({ where: { cloudinaryPublicId: mdata.cloudinaryPublicId }, update: mdata, create: { id: m.id, ...mdata } });
  }

  // ─────────────────────────── summary ───────────────────────────
  const [products, variants, images, users, orders, reviews, coupons] = await Promise.all([
    prisma.product.count(),
    prisma.productVariant.count(),
    prisma.productImage.count(),
    prisma.user.count(),
    prisma.order.count(),
    prisma.review.count(),
    prisma.coupon.count(),
  ]);

  console.log('\n✅ Demo seed complete.');
  console.log('────────────────────────────────────────');
  console.log(`  Products ${products} · Variants ${variants} · Images ${images}`);
  console.log(`  Users ${users} · Orders ${orders} · Reviews ${reviews} · Coupons ${coupons}`);
  console.log('────────────────────────────────────────');
  console.log('  Customer logins (password: ' + DEMO_PASSWORD + '):');
  console.log('    alice@example.com  (active, has orders + reviews)');
  console.log('    bob@example.com    (active)');
  console.log('    carol@example.com  (active)');
  console.log('    david@example.com  (BANNED — tests blocked login)');
  console.log('  Admin: whatever ADMIN_EMAIL / ADMIN_PASSWORD are in .env.development');
  console.log('────────────────────────────────────────');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
