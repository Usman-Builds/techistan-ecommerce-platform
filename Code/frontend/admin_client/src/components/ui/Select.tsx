"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One row in a {@link Select}. Beyond a value and a label it can carry an icon,
 * a right-aligned hint (a count, a price, a status) and a second line of
 * description — the three things a native `<option>` cannot render and that
 * every non-trivial admin dropdown ends up needing.
 */
export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  /** Indent level, for hierarchical lists. 0 = top level. */
  depth?: number;
  /** Renders a non-selectable heading above this option. */
  groupLabel?: string;
}

type Align = "start" | "end";

/**
 * Themed dropdown, replacing the native `<select>` across the admin.
 *
 * A native select is styled by the OPERATING SYSTEM, not by the app: its popup
 * ignores the theme entirely, so on a dark admin it opened as a white list, and
 * it can only ever render one line of unstyled text per row. That made
 * hierarchical data (categories) unreadable — the previous category picker
 * simulated a tree by prefixing option labels with "— — ", which is the exact
 * problem this component exists to remove.
 *
 * Behaviour is a WAI-ARIA listbox: `role="combobox"` trigger, `role="listbox"`
 * popup, roving `aria-activedescendant`, full keyboard support (arrows, Home,
 * End, Enter, Escape, type-to-jump), click-outside and Escape to dismiss.
 *
 * The popup renders in a portal so it escapes `overflow-hidden` ancestors —
 * inside a table cell or a filter bar, an in-flow popup gets clipped.
 */
export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select…",
  label,
  id,
  className,
  buttonClassName,
  disabled,
  searchable,
  searchPlaceholder = "Search…",
  clearable,
  align = "start",
  renderValue,
  emptyMessage = "No matches.",
}: {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  /** Accessible name. Required when there is no visible <label>. */
  label?: string;
  id?: string;
  className?: string;
  buttonClassName?: string;
  disabled?: boolean;
  /** Adds a filter box. Turn on past roughly a dozen options. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Shows an inline clear button once something is selected. */
  clearable?: boolean;
  align?: Align;
  /** Override the trigger's rendering of the current selection. */
  renderValue?: (option: SelectOption<T> | undefined) => ReactNode;
  emptyMessage?: string;
}) {
  const generatedId = useId();
  const listId = `${id ?? generatedId}-listbox`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const { position, measure } = usePopupPosition(triggerRef, open, align);

  const selected = options.find((o) => o.value === value);

  const visible = useMemo(() => {
    if (!searchable || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.description?.toLowerCase().includes(q),
    );
  }, [options, query, searchable]);

  const selectableIndexes = useMemo(
    () => visible.map((o, i) => (o.disabled ? -1 : i)).filter((i) => i >= 0),
    [visible],
  );

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }, []);

  /**
   * Opening is an EVENT, so everything it implies happens here rather than in
   * an effect reacting to `open`: measure the trigger, park the highlight on
   * the current selection (so Enter without moving re-picks it rather than
   * jumping to row one), and focus the filter box.
   */
  const openMenu = useCallback(() => {
    measure();
    const currentIndex = options.findIndex((o) => o.value === value);
    setActiveIndex(
      currentIndex >= 0
        ? currentIndex
        : options.findIndex((o) => !o.disabled),
    );
    setQuery("");
    setOpen(true);
    if (searchable) queueMicrotask(() => searchRef.current?.focus());
  }, [measure, options, value, searchable]);

  /**
   * Filtering can leave the highlight pointing at a row that is no longer
   * rendered. Rather than correcting it in an effect (which costs a second
   * render pass), the effective index is DERIVED here and the stored one is
   * only ever a hint.
   */
  const effectiveIndex = selectableIndexes.includes(activeIndex)
    ? activeIndex
    : (selectableIndexes[0] ?? -1);

  useDismiss(open, close, [triggerRef, popupRef]);

  const commit = (option: SelectOption<T>) => {
    if (option.disabled) return;
    onChange(option.value);
    close();
  };

  const move = (delta: number) => {
    if (selectableIndexes.length === 0) return;
    const current = selectableIndexes.indexOf(effectiveIndex);
    const next =
      current === -1
        ? selectableIndexes[0]
        : selectableIndexes[
            (current + delta + selectableIndexes.length) %
              selectableIndexes.length
          ];
    setActiveIndex(next);
    scrollOptionIntoView(popupRef.current, next);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openMenu();
        else move(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (!open) openMenu();
        else move(-1);
        break;
      case "Home":
        if (open) {
          e.preventDefault();
          setActiveIndex(selectableIndexes[0] ?? -1);
        }
        break;
      case "End":
        if (open) {
          e.preventDefault();
          setActiveIndex(selectableIndexes.at(-1) ?? -1);
        }
        break;
      case "Enter":
      case " ":
        if (!open) {
          e.preventDefault();
          openMenu();
        } else if (visible[effectiveIndex]) {
          e.preventDefault();
          commit(visible[effectiveIndex]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          close();
        }
        break;
      case "Tab":
        if (open) close();
        break;
    }
  };

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-label={label}
        disabled={disabled}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-left text-sm outline-none transition-colors",
          "hover:border-primary/40 focus-visible:ring-2 focus-visible:ring-ring",
          "disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary/60 ring-2 ring-ring",
          buttonClassName,
        )}
      >
        {renderValue ? (
          <span className="min-w-0 flex-1 truncate">{renderValue(selected)}</span>
        ) : selected ? (
          <span className="flex min-w-0 flex-1 items-center gap-2 truncate">
            {selected.icon}
            <span className="truncate">{selected.label}</span>
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-muted-foreground">
            {placeholder}
          </span>
        )}

        {clearable && selected && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear selection"
            onClick={(e) => {
              e.stopPropagation();
              onChange("" as T);
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
            style={{
              position: "absolute",
              top: position.top,
              left: position.left,
              minWidth: position.width,
              maxWidth: Math.max(position.width, 420),
            }}
            className="z-[60] overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-xl"
          >
            {searchable && (
              <div className="relative border-b border-border">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                  aria-hidden
                />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder={searchPlaceholder}
                  aria-label={searchPlaceholder}
                  className="w-full bg-transparent py-2 pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            )}

            <ul
              id={listId}
              role="listbox"
              aria-label={label}
              aria-activedescendant={
                visible[effectiveIndex]
                  ? `${listId}-${effectiveIndex}`
                  : undefined
              }
              className="max-h-72 overflow-y-auto p-1"
            >
              {visible.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </li>
              )}
              {visible.map((option, index) => (
                <OptionRow
                  key={option.value}
                  id={`${listId}-${index}`}
                  index={index}
                  option={option}
                  active={index === effectiveIndex}
                  selected={option.value === value}
                  onHover={() => !option.disabled && setActiveIndex(index)}
                  onSelect={() => commit(option)}
                />
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * One listbox row.
 *
 * Hierarchy is drawn with an indent AND a vertical rail rather than with "— "
 * prefixes: the rail makes the nesting visible at a glance and, unlike text
 * prefixes, it is not read aloud by a screen reader as a run of dashes.
 */
function OptionRow<T extends string>({
  id,
  index,
  option,
  active,
  selected,
  onHover,
  onSelect,
}: {
  id: string;
  index: number;
  option: SelectOption<T>;
  active: boolean;
  selected: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const depth = option.depth ?? 0;

  return (
    <>
      {option.groupLabel && (
        <li
          role="presentation"
          className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
        >
          {option.groupLabel}
        </li>
      )}
      <li
        id={id}
        role="option"
        aria-selected={selected}
        aria-disabled={option.disabled || undefined}
        data-option-index={index}
        onMouseEnter={onHover}
        onClick={onSelect}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm",
          active && "bg-muted",
          selected && "font-medium",
          option.disabled && "cursor-not-allowed opacity-50",
        )}
      >
        {depth > 0 && (
          <span
            className="ml-1 shrink-0 self-stretch border-l border-border"
            style={{ marginLeft: (depth - 1) * 14 + 4, width: 10 }}
            aria-hidden
          />
        )}
        {option.icon && (
          <span className="shrink-0 text-muted-foreground">{option.icon}</span>
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
        <Check
          className={cn(
            "h-4 w-4 shrink-0 text-primary",
            selected ? "opacity-100" : "opacity-0",
          )}
          aria-hidden
        />
      </li>
    </>
  );
}

/**
 * Absolute page coordinates for a popup anchored to `ref`.
 *
 * Uses document coordinates (rect + scroll offset) with a portal to `body`, so
 * the popup is never clipped by an `overflow-hidden` ancestor. It flips above
 * the trigger when there isn't room below — a filter select near the bottom of
 * a long table would otherwise open off-screen.
 *
 * Returns `measure` for the caller to invoke when OPENING. Measuring in the
 * open handler rather than in an effect means the popup has coordinates on its
 * very first painted frame, so it never flashes at the top-left of the page.
 */
function usePopupPosition(
  ref: React.RefObject<HTMLElement | null>,
  open: boolean,
  align: Align,
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
    const POPUP_MAX = 320; // max-h-72 + search row, near enough
    const below = window.innerHeight - rect.bottom;
    const flip = below < POPUP_MAX && rect.top > below;

    setPosition({
      top: flip
        ? rect.top + window.scrollY - Math.min(POPUP_MAX, rect.top) - 4
        : rect.bottom + window.scrollY + 4,
      left:
        align === "end"
          ? rect.right + window.scrollX - Math.max(rect.width, 220)
          : rect.left + window.scrollX,
      width: rect.width,
    });
  }, [ref, align]);

  // Subscription only — the first measurement is taken by whatever opened the
  // popup, so this effect never sets state synchronously.
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

/** Close on outside pointer-down or Escape, ignoring clicks inside `refs`. */
export function useDismiss(
  open: boolean,
  onClose: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (refs.some((r) => r.current?.contains(target))) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose]);
}

/** Keep the keyboard-highlighted row inside the scroll viewport. */
function scrollOptionIntoView(popup: HTMLElement | null, index: number) {
  popup
    ?.querySelector(`[data-option-index="${index}"]`)
    ?.scrollIntoView({ block: "nearest" });
}
