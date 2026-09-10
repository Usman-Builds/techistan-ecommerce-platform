"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

type Mode = "light" | "dark" | "system";
const ORDER: Mode[] = ["light", "dark", "system"];
const NEXT: Record<Mode, Mode> = { light: "dark", dark: "system", system: "light" };
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL = { light: "Light", dark: "Dark", system: "System" } as const;

/**
 * Accessible theme switcher cycling Light → Dark → System.
 * Renders a neutral placeholder until mounted to avoid a hydration mismatch
 * (the server can't know the resolved theme).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const { theme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  const current: Mode =
    mounted && ORDER.includes(theme as Mode) ? (theme as Mode) : "system";
  const Icon = ICON[current];
  const next = NEXT[current];

  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Theme: ${LABEL[current]}. Switch to ${LABEL[next]}.`}
      title={`Theme: ${LABEL[current]}`}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border bg-background text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {mounted ? (
        <Icon className="h-5 w-5" aria-hidden />
      ) : (
        <span className="h-5 w-5" aria-hidden />
      )}
    </button>
  );
}
