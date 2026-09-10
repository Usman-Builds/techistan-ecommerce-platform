"use client";

import { passwordStrength } from "@/lib/validation/auth";
import { cn } from "@/lib/utils";

const LABELS = ["Too weak", "Weak", "Fair", "Good", "Strong"];
const BAR_COLORS = [
  "bg-destructive",
  "bg-destructive",
  "bg-warning",
  "bg-accent",
  "bg-success",
];

/**
 * Inline password-strength meter (advisory). Score 0–4 from
 * `passwordStrength()`, which mirrors the backend password policy.
 */
export function PasswordStrengthMeter({ value }: { value: string }) {
  const score = passwordStrength(value);
  const active = value.length > 0;

  return (
    <div className="mt-2" aria-live="polite">
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full transition-colors",
              active && i < score ? BAR_COLORS[score] : "bg-muted",
            )}
          />
        ))}
      </div>
      {active && (
        <p className="mt-1 text-xs text-muted-foreground">
          Password strength: <span className="font-medium">{LABELS[score]}</span>
        </p>
      )}
    </div>
  );
}
