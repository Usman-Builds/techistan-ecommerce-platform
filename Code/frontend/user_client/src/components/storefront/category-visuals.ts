import {
  Aperture,
  Award,
  BadgePercent,
  Boxes,
  Cable,
  Camera,
  Clock,
  Cpu,
  Flame,
  Gamepad2,
  Gift,
  HardDrive,
  Headphones,
  Heart,
  Joystick,
  Keyboard,
  Laptop,
  LifeBuoy,
  MemoryStick,
  Monitor,
  Mouse,
  Network,
  Package,
  Percent,
  Plane,
  Router,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Speaker,
  Star,
  Tablet,
  Tag,
  Truck,
  Wallet,
  Watch,
  Zap,
  type LucideIcon,
} from "lucide-react";

/**
 * Per-category ICON lookup.
 *
 * Categories are store data, not code, so this can never be an exhaustive
 * table — an admin can add "Storage & SSDs" tomorrow. Resolution is therefore
 * four-tiered:
 *
 *   0. the icon the ADMIN chose for the category (`Category.iconKey`),
 *   1. exact slug match (the seeded catalog),
 *   2. keyword match on the slug/name (covers admin-authored categories that
 *      contain a word we recognise, e.g. "gaming-keyboards" -> Keyboard),
 *   3. the generic Package icon.
 *
 * Tier 0 is what turns the rest of this file into a FALLBACK rather than the
 * rule: the heuristic below can only ever guess, so an explicit choice always
 * wins. The registry it looks the choice up in is deliberately the same
 * curated set the admin's icon picker offers, so an admin cannot store a key
 * the storefront is unable to render.
 *
 * This file used to hand out a per-category ACCENT COLOUR as well, cycling six
 * brand hues so every tile, chip and mega-menu row was tinted differently. That
 * is gone: a category's identity is now its icon and its photograph, and every
 * icon renders in the one brand colour (or in plain foreground/muted, where the
 * icon is structural rather than promotional). Colour stopped carrying
 * information the moment there were six of them.
 */
type Visual = { icon: LucideIcon };

/**
 * Tier 0 — the icons an admin can explicitly choose, keyed by name. Mirrors
 * `admin_client/src/lib/icons.ts`; the two are duplicated rather than shared
 * for the same reason the Logo is, since the clients ship independently.
 */
const BY_KEY: Record<string, LucideIcon> = {
  Package,
  Cpu,
  Laptop,
  Monitor,
  MemoryStick,
  HardDrive,
  Smartphone,
  Tablet,
  Watch,
  Headphones,
  Speaker,
  Gamepad2,
  Joystick,
  Keyboard,
  Mouse,
  Camera,
  Aperture,
  Plane,
  Network,
  Router,
  Cable,
  Zap,
  Boxes,
  Tag,
  BadgePercent,
  Percent,
  Gift,
  Star,
  Sparkles,
  Flame,
  Heart,
  Award,
  Truck,
  ShieldCheck,
  LifeBuoy,
  Wallet,
  Clock,
};

/** Resolve an admin-chosen icon name. Unknown names fall through to the heuristic. */
export function iconByKey(key: string | null | undefined): LucideIcon | null {
  return key ? (BY_KEY[key] ?? null) : null;
}

/** Tier 1 — the seeded catalog, by exact slug. */
const BY_SLUG: Record<string, Visual> = {
  computers: { icon: Cpu },
  laptops: { icon: Laptop },
  "desktops-monitors": { icon: Monitor },
  "pc-components": { icon: MemoryStick },
  mobile: { icon: Smartphone },
  smartphones: { icon: Smartphone },
  wearables: { icon: Watch },
  audio: { icon: Headphones },
  headphones: { icon: Headphones },
  speakers: { icon: Speaker },
  gaming: { icon: Gamepad2 },
  consoles: { icon: Joystick },
  "gaming-gear": { icon: Keyboard },
  "cameras-drones": { icon: Camera },
  accessories: { icon: Zap },
  peripherals: { icon: Mouse },
  "power-cables": { icon: Cable },
  networking: { icon: Network },
  storage: { icon: HardDrive },
  tablets: { icon: Tablet },
};

/**
 * Tier 2 — keyword → icon. Ordered most-specific first, because the first hit
 * wins: "gaming-keyboard" must resolve to Keyboard, not Gamepad2, so `keyboard`
 * is tested before `gaming`.
 */
const BY_KEYWORD: [needle: string, icon: LucideIcon][] = [
  ["keyboard", Keyboard],
  ["mouse", Mouse],
  ["headphone", Headphones],
  ["earbud", Headphones],
  ["speaker", Speaker],
  ["audio", Headphones],
  ["laptop", Laptop],
  ["notebook", Laptop],
  ["monitor", Monitor],
  ["display", Monitor],
  ["desktop", Monitor],
  ["tablet", Tablet],
  ["phone", Smartphone],
  ["mobile", Smartphone],
  ["watch", Watch],
  ["wearable", Watch],
  ["console", Joystick],
  ["gaming", Gamepad2],
  ["game", Gamepad2],
  ["drone", Plane],
  ["camera", Camera],
  ["lens", Aperture],
  ["storage", HardDrive],
  ["ssd", HardDrive],
  ["drive", HardDrive],
  ["memory", MemoryStick],
  ["ram", MemoryStick],
  ["component", Cpu],
  ["cpu", Cpu],
  ["gpu", Cpu],
  ["computer", Cpu],
  ["network", Network],
  ["router", Router],
  ["wifi", Router],
  ["cable", Cable],
  ["power", Zap],
  ["charger", Zap],
  ["peripheral", Mouse],
  ["accessor", Boxes],
];

/**
 * Resolve a category's icon.
 *
 * `iconKey` is the admin's explicit choice and always wins. `name` is only used
 * for tier-2 keyword matching, so a category slugged `cat-7` named "Gaming
 * Laptops" still resolves sensibly without one.
 */
export function categoryVisual(
  slug: string,
  name = "",
  iconKey?: string | null,
): Visual {
  const chosen = iconByKey(iconKey);
  if (chosen) return { icon: chosen };

  const exact = BY_SLUG[slug];
  if (exact) return exact;

  const haystack = `${slug} ${name}`.toLowerCase();
  const keyword = BY_KEYWORD.find(([needle]) => haystack.includes(needle));

  return { icon: keyword ? keyword[1] : Package };
}
