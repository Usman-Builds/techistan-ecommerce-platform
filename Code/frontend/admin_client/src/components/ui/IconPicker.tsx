"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Sparkles, X } from "lucide-react";
import { ICON_OPTIONS, resolveIcon, type IconKey } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useDismiss } from "./Select";
import { Glyph } from "./Glyph";

/**
 * Icon picker for categories, navigation entries and homepage sections.
 *
 * A grid rather than a dropdown list: icons are recognised by SHAPE, so showing
 * forty at once and letting the eye find one beats scrolling a list of names.
 *
 * `suggestion` is the key the storefront's keyword heuristic would pick for
 * this thing anyway. Offering it explicitly makes the common case ("just use
 * the sensible one") a single click, and makes clearing the field meaningful:
 * empty means "keep following the heuristic", not "no icon".
 */
export function IconPicker({
  value,
  onChange,
  suggestion,
  id,
  label = "Icon",
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (key: string | null) => void;
  suggestion?: IconKey;
  id?: string;
  label?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  useDismiss(open, () => setOpen(false), [triggerRef, popupRef]);

  const current = resolveIcon(value);
  const suggested = resolveIcon(suggestion);

  const toggle = () => {
    const el = triggerRef.current;
    if (el && !open) {
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.bottom + window.scrollY + 4,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
    setOpen((v) => !v);
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none transition-colors",
          "hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary/60 ring-2 ring-ring",
        )}
      >
        {current ? (
          <>
            <Glyph icon={current} className="h-4 w-4 shrink-0 text-primary" />
            <span className="flex-1 truncate">{value}</span>
          </>
        ) : (
          <>
            {suggested ? (
              <Glyph
                icon={suggested}
                className="h-4 w-4 shrink-0 text-muted-foreground"
              />
            ) : (
              <Sparkles
                className="h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            )}
            <span className="flex-1 truncate text-muted-foreground">
              Automatic{suggestion ? ` (${suggestion})` : ""}
            </span>
          </>
        )}
        {value && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Use the automatic icon"
            onClick={(e) => {
              e.stopPropagation();
              onChange(null);
            }}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            role="dialog"
            aria-label={label}
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              minWidth: Math.max(position.width, 280),
            }}
            className="z-[60] rounded-lg border border-border bg-card p-2 text-card-foreground shadow-xl"
          >
            <button
              type="button"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className={cn(
                "mb-2 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                !value && "bg-muted font-medium",
              )}
            >
              <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden />
              Automatic
              {suggestion && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {suggestion}
                </span>
              )}
            </button>

            <div
              className="grid max-h-64 grid-cols-8 gap-1 overflow-y-auto"
              role="group"
              aria-label="Icons"
            >
              {ICON_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  title={option.key}
                  aria-label={option.key}
                  aria-pressed={value === option.key}
                  onClick={() => {
                    onChange(option.key);
                    setOpen(false);
                  }}
                  className={cn(
                    "grid aspect-square place-items-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    value === option.key &&
                      "border-primary bg-primary/10 text-primary",
                  )}
                >
                  <Glyph icon={option.Icon} className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
