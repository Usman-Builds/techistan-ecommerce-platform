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
 * The icon vocabulary shared by categories, navigation entries and homepage
 * sections.
 *
 * Icons are stored as a STRING key (`Category.iconKey`, `NavItem.icon`,
 * `HomepageSection.config.icon`) rather than as a component, because they cross
 * the API as data. This registry is the one place that maps a key back to a
 * component, so admin and storefront can never disagree about what "Laptop"
 * means.
 *
 * It is deliberately a curated subset of lucide, not the whole library: a
 * picker with 1,500 entries is not a picker, and an unbounded key would let an
 * admin store something the storefront cannot render.
 */
export const ICON_REGISTRY = {
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
} as const satisfies Record<string, LucideIcon>;

export type IconKey = keyof typeof ICON_REGISTRY;

/** Ordered list for the picker UI. */
export const ICON_OPTIONS: { key: IconKey; Icon: LucideIcon }[] = (
  Object.keys(ICON_REGISTRY) as IconKey[]
).map((key) => ({ key, Icon: ICON_REGISTRY[key] }));

/** Resolve a stored key to a component. Unknown keys resolve to null. */
export function resolveIcon(key: string | null | undefined): LucideIcon | null {
  if (!key) return null;
  return (ICON_REGISTRY as Record<string, LucideIcon>)[key] ?? null;
}

/**
 * Keyword fallback, mirroring the storefront's heuristic.
 *
 * Ordered most-specific first because the first hit wins: "gaming-keyboards"
 * has to resolve to Keyboard, not Gamepad2.
 */
const BY_KEYWORD: [needle: string, key: IconKey][] = [
  ["keyboard", "Keyboard"],
  ["mouse", "Mouse"],
  ["headphone", "Headphones"],
  ["earbud", "Headphones"],
  ["speaker", "Speaker"],
  ["audio", "Headphones"],
  ["laptop", "Laptop"],
  ["notebook", "Laptop"],
  ["monitor", "Monitor"],
  ["display", "Monitor"],
  ["desktop", "Monitor"],
  ["tablet", "Tablet"],
  ["phone", "Smartphone"],
  ["mobile", "Smartphone"],
  ["watch", "Watch"],
  ["wearable", "Watch"],
  ["console", "Joystick"],
  ["gaming", "Gamepad2"],
  ["game", "Gamepad2"],
  ["drone", "Plane"],
  ["camera", "Camera"],
  ["lens", "Aperture"],
  ["storage", "HardDrive"],
  ["ssd", "HardDrive"],
  ["drive", "HardDrive"],
  ["memory", "MemoryStick"],
  ["ram", "MemoryStick"],
  ["component", "Cpu"],
  ["cpu", "Cpu"],
  ["gpu", "Cpu"],
  ["computer", "Cpu"],
  ["network", "Network"],
  ["router", "Router"],
  ["wifi", "Router"],
  ["cable", "Cable"],
  ["power", "Zap"],
  ["charger", "Zap"],
  ["peripheral", "Mouse"],
  ["accessor", "Boxes"],
];

/** The key the heuristic would pick for a category, for the picker's default. */
export function guessIconKey(slug: string, name = ""): IconKey {
  const haystack = `${slug} ${name}`.toLowerCase();
  return BY_KEYWORD.find(([needle]) => haystack.includes(needle))?.[1] ?? "Package";
}

/**
 * A category's icon: the admin's explicit choice if there is one, otherwise the
 * keyword guess. Never null, so callers don't each invent a fallback.
 */
export function categoryIcon(
  slug: string,
  name: string,
  iconKey?: string | null,
): LucideIcon {
  return resolveIcon(iconKey) ?? ICON_REGISTRY[guessIconKey(slug, name)];
}
