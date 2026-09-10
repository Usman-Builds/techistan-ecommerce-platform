"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismiss, type SelectOption } from "./Select";

/**
 * Themed multi-select with chips.
 *
 * Built for promotion scoping, where the merchant picks "these categories" or
 * "these products". Three properties matter there and none are available from a
 * native `<select multiple>`:
 *
 *   * the current selection stays VISIBLE as removable chips, so a coupon
 *     scoped to nine products doesn't hide eight of them behind a scrollbar;
 *   * rows carry an icon, a second line and a right-hand hint (a product count,
 *     a SKU), which is how a category or a product is actually identified;
 *   * the list can be searched, because a real catalog has hundreds of rows.
 *
 * The popup is a `role="listbox"` with `aria-multiselectable`, and selecting
 * does NOT close it — picking six categories should not mean opening the menu
 * six times.
 */
export function MultiSelect<T extends string = string>({
  values,
  onChange,
  options,
  placeholder = "Select…",
  label,
  id,
  className,
  disabled,
  searchPlaceholder = "Search…",
  emptyMessage = "No matches.",
  max,
  onSearch,
  loading,
}: {
  values: T[];
  onChange: (values: T[]) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  label?: string;
  id?: string;
  className?: string;
  disabled?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Hard cap; rows past it are disabled rather than silently ignored. */
  max?: number;
  /**
   * Opt into REMOTE search. When provided, the query is reported here and local
   * filtering is skipped — the parent is expected to hand back a new `options`
   * list. Needed for catalogs too large to ship to the browser up front.
   */
  onSearch?: (query: string) => void;
  /** Shows a loading row. Only meaningful alongside `onSearch`. */
  loading?: boolean;
}) {
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { position, measure } = useAnchoredPosition(triggerRef, open);

  const selectedSet = useMemo(() => new Set(values), [values]);
  const selectedOptions = useMemo(
    () => values.map((v) => options.find((o) => o.value === v) ?? null),
    [values, options],
  );

  // With remote search the parent has already filtered; re-filtering locally
  // would hide rows the server deliberately returned (a SKU match whose title
  // does not contain the query, say).
  const visible = useMemo(() => {
    if (onSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q),
    );
  }, [options, query, onSearch]);

  const atCapacity = max != null && values.length >= max;

  /**
   * Opening is an event, so its side effects live here rather than in an effect
   * watching `open`: measure the anchor (so the popup is positioned on its
   * first painted frame), clear the last filter, focus the box.
   */
  const openMenu = useCallback(() => {
    measure();
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
    queueMicrotask(() => searchRef.current?.focus());
  }, [measure]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery("");
  }, []);

  useDismiss(open, closeMenu, [triggerRef, popupRef]);

  const toggle = (option: SelectOption<T>) => {
    if (option.disabled) return;
    if (selectedSet.has(option.value)) {
      onChange(values.filter((v) => v !== option.value));
    } else {
      if (atCapacity) return;
      onChange([...values, option.value]);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else setActiveIndex((i) => Math.min(i + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && open && visible[activeIndex]) {
      e.preventDefault();
      toggle(visible[activeIndex]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      closeMenu();
    } else if (
      e.key === "Backspace" &&
      query === "" &&
      values.length > 0 &&
      open
    ) {
      // Backspace on an empty filter removes the last chip — the behaviour
      // every tag input has, and the fastest way to undo a misclick.
      onChange(values.slice(0, -1));
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div
        ref={triggerRef}
        className={cn(
          "flex min-h-[2.5rem] w-full flex-wrap items-center gap-1.5 rounded-md border border-input bg-background px-2 py-1.5 text-sm transition-colors",
          "focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-ring",
          disabled && "cursor-not-allowed opacity-50",
          open && "border-primary/60",
        )}
      >
        {selectedOptions.map((option, i) =>
          option ? (
            <span
              key={option.value}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium"
            >
              {option.icon && (
                <span className="shrink-0 text-muted-foreground">
                  {option.icon}
                </span>
              )}
              <span className="truncate">{option.label}</span>
              <button
                type="button"
                aria-label={`Remove ${option.label}`}
                disabled={disabled}
                onClick={() =>
                  onChange(values.filter((v) => v !== option.value))
                }
                className="rounded text-muted-foreground hover:text-destructive"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ) : (
            // The option list hasn't loaded (or the target was deleted). Show
            // the raw id rather than dropping it, so a save can't silently
            // discard a selection the admin never saw.
            <span
              key={values[i]}
              className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground"
            >
              {values[i]}
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(values.filter((v) => v !== values[i]))}
                className="rounded hover:text-destructive"
              >
                <X className="h-3 w-3" aria-hidden />
              </button>
            </span>
          ),
        )}

        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={open ? listId : undefined}
          aria-haspopup="listbox"
          aria-label={label}
          disabled={disabled}
          onClick={() => (open ? closeMenu() : openMenu())}
          onKeyDown={onKeyDown}
          className="flex min-w-[6rem] flex-1 items-center gap-1 rounded px-1 py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex-1 truncate text-muted-foreground">
            {values.length === 0 ? placeholder : "Add more…"}
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </button>
      </div>

      {max != null && (
        <p className="mt-1 text-xs text-muted-foreground">
          {values.length} of {max} selected
        </p>
      )}

      {open &&
        position &&
        createPortal(
          <div
            ref={popupRef}
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              minWidth: position.width,
              maxWidth: Math.max(position.width, 480),
            }}
            className="z-[60] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl"
          >
            <div className="relative border-b border-border">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIndex(0);
                  onSearch?.(e.target.value);
                }}
                onKeyDown={onKeyDown}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="w-full bg-transparent py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>

            <ul
              id={listId}
              role="listbox"
              aria-multiselectable
              aria-label={label}
              className="max-h-72 overflow-y-auto p-1"
            >
              {loading && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Searching…
                </li>
              )}
              {!loading && visible.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </li>
              )}
              {visible.map((option, index) => {
                const isSelected = selectedSet.has(option.value);
                const blocked = option.disabled || (atCapacity && !isSelected);
                const depth = option.depth ?? 0;
                return (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={blocked || undefined}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => !blocked && toggle(option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                      index === activeIndex && "bg-muted",
                      blocked && "cursor-not-allowed opacity-50",
                    )}
                  >
                    <span
                      className={cn(
                        "grid h-4 w-4 shrink-0 place-items-center rounded border",
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border",
                      )}
                      aria-hidden
                    >
                      {isSelected && <Check className="h-3 w-3" />}
                    </span>
                    {depth > 0 && (
                      <span
                        className="shrink-0 self-stretch border-l border-border"
                        style={{ marginLeft: (depth - 1) * 14, width: 10 }}
                        aria-hidden
                      />
                    )}
                    {option.icon && (
                      <span className="shrink-0 text-muted-foreground">
                        {option.icon}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{option.label}</span>
                      {option.description && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {option.description}
                        </span>
                      )}
                    </span>
                    {option.hint && (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {option.hint}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            {values.length > 0 && (
              <div className="flex items-center justify-between border-t border-border px-3 py-2 text-xs">
                <span className="text-muted-foreground">
                  {values.length} selected
                </span>
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="font-medium text-primary hover:underline"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Document-space coordinates for a popup anchored under `ref`.
 *
 * `measure` is called by whatever OPENS the popup, so the first paint already
 * has coordinates; the effect only subscribes to scroll and resize.
 */
function useAnchoredPosition(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
) {
  const [position, setPosition] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const POPUP_MAX = 340;
    const below = window.innerHeight - rect.bottom;
    const flip = below < POPUP_MAX && rect.top > below;
    setPosition({
      top: flip
        ? rect.top + window.scrollY - Math.min(POPUP_MAX, rect.top) - 4
        : rect.bottom + window.scrollY + 4,
      left: rect.left + window.scrollX,
      width: rect.width,
    });
  }, [ref]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  return { position, measure };
}
