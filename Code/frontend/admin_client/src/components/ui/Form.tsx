"use client";

import { useId, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Form primitives shared by the merchandising screens.
 *
 * Every admin form here had been growing its own label + hint + error markup,
 * which is how two screens end up disagreeing about where an error message
 * goes. These four components fix the answer once: the label is always above,
 * the hint always below the control, the error replaces the hint, and the
 * control is always wired to both by id.
 */

/** A labelled form control with optional hint and error. */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  className,
  children,
}: {
  label: string;
  /** Id of the control. Omit when `children` is a render function. */
  htmlFor?: string;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label
        htmlFor={htmlFor}
        className="block text-sm font-medium text-foreground"
      >
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Themed text input, matching the Select trigger's metrics exactly.
 *
 * Typed with ComponentPropsWithRef so callers can hold a ref (React 19 passes
 * `ref` to function components as an ordinary prop, so no forwardRef needed).
 */
export function Input({
  className,
  ...props
}: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors",
        "placeholder:text-muted-foreground hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

/** Themed textarea. */
export function Textarea({
  className,
  ...props
}: React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none transition-colors",
        "placeholder:text-muted-foreground hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
    />
  );
}

/**
 * On/off switch.
 *
 * A switch rather than a checkbox because every use here is an immediate state
 * change ("visible", "enabled", "advertise this code") rather than a value
 * being collected for later submission — and a switch reads as on/off at a
 * glance where a checkbox reads as ticked/unticked.
 *
 * Three things this deliberately gets right, each of which was previously
 * wrong and made the control feel broken:
 *
 * 1. THE WHOLE ROW IS THE SWITCH. The label and description live inside the
 *    `role="switch"` button, so clicking the words toggles it — the behaviour
 *    every checkbox on the web has. Before, only the 36px track responded and
 *    clicking the label did nothing at all.
 *
 * 2. IT MOVES ON CLICK, NOT ON RESPONSE. Several switches here are backed by a
 *    server round-trip (`update.mutate({ enabled })`), and `checked` only
 *    becomes true once the refetch lands. That read as a dead control followed
 *    by a jump. `shown` is the pending intent, so the knob slides immediately
 *    and the prop reconciles it when it arrives.
 *
 * 3. REPEATED CLICKS ALTERNATE. Because a click used to send `!checked` and
 *    `checked` had not updated yet, clicking twice quickly sent the SAME value
 *    twice and the switch ended up stuck. Clicks now flip the pending value.
 *
 * If a request fails the prop never changes, so `onError` in the caller's
 * mutation is what puts the knob back; `revertOn` exists for that.
 */
export function Toggle({
  checked,
  onChange,
  label,
  srLabel,
  description,
  disabled,
  revertOn,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Visible label. Omit for a bare switch in a row — pass `srLabel` instead. */
  label?: string;
  /** Accessible name when there is no visible label. */
  srLabel?: string;
  description?: string;
  disabled?: boolean;
  /**
   * Pass a failure flag (`mutation.isError`). When it becomes truthy the
   * pending position is dropped and the switch snaps back to `checked` — a
   * failed write leaves the prop unchanged, so there is nothing else to
   * reconcile against.
   */
  revertOn?: unknown;
  className?: string;
}) {
  const id = useId();

  // Pending intent. `null` means "no click outstanding — trust the prop".
  const [pending, setPending] = useState<boolean | null>(null);
  const [seen, setSeen] = useState(checked);
  const [seenRevert, setSeenRevert] = useState(revertOn);

  // Adjusting state during render (the documented React pattern) rather than in
  // an effect: the reconciled value must be visible in THIS paint, or the knob
  // visibly bounces to the stale position for a frame first.
  if (seen !== checked) {
    setSeen(checked);
    setPending(null);
  }
  if (seenRevert !== revertOn) {
    setSeenRevert(revertOn);
    // Only a change TO a truthy value is a failure signal. Clearing the flag
    // (the next attempt starting) must not throw away the click just made.
    if (revertOn) setPending(null);
  }

  const shown = pending ?? checked;

  const flip = () => {
    if (disabled) return;
    const next = !shown;
    setPending(next);
    onChange(next);
  };

  const hasText = Boolean(label || description);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={shown}
      aria-labelledby={label ? `${id}-label` : undefined}
      aria-label={label ? undefined : (srLabel ?? "Toggle")}
      aria-describedby={description ? `${id}-desc` : undefined}
      disabled={disabled}
      onClick={flip}
      className={cn(
        "group flex gap-3 rounded-lg text-left outline-none",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        // With text the track aligns to the first line; bare in a toolbar row
        // it should centre like every other control beside it.
        hasText ? "items-start -m-1 p-1" : "items-center",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
    >
      <span
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full border transition-colors",
          hasText && "mt-0.5",
          shown
            ? "border-primary bg-primary"
            : "border-border bg-muted-foreground/25",
          !disabled &&
            (shown
              ? "group-hover:bg-primary/85"
              : "group-hover:bg-muted-foreground/40"),
        )}
        aria-hidden
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out",
            shown ? "translate-x-5" : "translate-x-0",
          )}
        />
      </span>

      {hasText && (
        <span className="min-w-0">
          {label && (
            <span
              id={`${id}-label`}
              className="block text-sm font-medium text-foreground"
            >
              {label}
            </span>
          )}
          {description && (
            <span
              id={`${id}-desc`}
              className="block text-xs text-muted-foreground"
            >
              {description}
            </span>
          )}
        </span>
      )}
    </button>
  );
}

/** A titled panel. The unit every admin form is built out of. */
export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-2xl border border-border bg-card p-5 text-card-foreground",
        className,
      )}
    >
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && (
              <h2 className="font-heading text-base font-bold">{title}</h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

/**
 * Segmented control — a small, mutually-exclusive choice where all the options
 * fit on one line (a promotion's scope, a menu's location).
 *
 * Preferred over a dropdown at this size because the alternatives stay visible:
 * choosing a scope is a decision, and a dropdown hides the two options you
 * didn't pick behind a click.
 */
export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  className,
  disabled,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string; icon?: ReactNode }[];
  label: string;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-lg border border-border bg-background p-1",
        disabled && "opacity-50",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
