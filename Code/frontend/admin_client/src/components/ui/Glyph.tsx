"use client";

import { createElement } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Render an icon component that was chosen at runtime.
 *
 * Icons here are stored as string keys and resolved to components at render
 * time (`resolveIcon`, `categoryIcon`). Assigning that result to a capitalised
 * local and putting it in JSX — `const Icon = resolveIcon(key); <Icon />` —
 * reads to the React Compiler as defining a component during render, which it
 * rightly rejects.
 *
 * Passing the component through as a PROP and instantiating it with
 * `createElement` says the same thing without that ambiguity: the component
 * already exists, we are only choosing which one. Rendering nothing for a null
 * icon also means callers don't each need their own conditional.
 */
export function Glyph({
  icon,
  className,
  label,
}: {
  icon: LucideIcon | null | undefined;
  className?: string;
  /** Accessible name. Omit for a decorative icon (the default). */
  label?: string;
}) {
  if (!icon) return null;
  return createElement(icon, {
    className,
    "aria-hidden": label ? undefined : true,
    "aria-label": label,
    role: label ? "img" : undefined,
  });
}
