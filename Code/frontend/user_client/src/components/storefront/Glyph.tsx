import { createElement } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Render an icon component that was chosen at runtime.
 *
 * Navigation and category icons are stored as string keys and resolved to
 * components while rendering. Assigning that result to a capitalised local and
 * putting it in JSX — `const Icon = iconByKey(key); <Icon />` — reads to the
 * React Compiler as defining a component during render, which it rejects.
 *
 * Passing the component through as a PROP and instantiating it with
 * `createElement` says the same thing without the ambiguity: the component
 * already exists, we are only choosing which one. Rendering nothing for a null
 * icon also saves every call site its own conditional.
 */
export function Glyph({
  icon,
  className,
}: {
  icon: LucideIcon | null | undefined;
  className?: string;
}) {
  if (!icon) return null;
  return createElement(icon, { className, "aria-hidden": true });
}
