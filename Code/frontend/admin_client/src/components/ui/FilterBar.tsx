"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, type SelectOption } from "./Select";

/** Layout wrapper for a screen's filter controls (search + selects + actions). */
export function FilterBar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

/** Debounce-friendly search input used across list screens. */
export function SearchInput({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn("relative", className)}>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:w-64"
      />
    </div>
  );
}

/**
 * Filter dropdown.
 *
 * Was a native `<select>`, whose popup is drawn by the operating system and so
 * ignored the admin theme entirely — on dark mode it opened as a white list.
 * Now it is the shared {@link Select}, which also means a filter row can carry
 * an icon or a count where that helps.
 */
export function FilterSelect<T extends string = string>({
  value,
  onChange,
  options,
  label,
  className,
  searchable,
}: {
  value: T | "";
  onChange: (value: T) => void;
  options: { value: T | ""; label: string; hint?: string; icon?: ReactNode }[];
  label: string;
  className?: string;
  searchable?: boolean;
}) {
  return (
    <Select<T>
      label={label}
      value={value as T}
      onChange={onChange}
      options={options as SelectOption<T>[]}
      className={cn("min-w-[10rem]", className)}
      searchable={searchable}
      placeholder={label}
    />
  );
}

/**
 * Collapsible drawer for the filters that don't fit on the primary row.
 *
 * List screens need a lot of filters and use two or three of them at a time.
 * Putting all of them on one row makes the screen look like a control panel and
 * pushes the actual data below the fold; hiding them entirely makes them
 * undiscoverable. So the two or three common ones stay on the bar and the rest
 * live one click away — with the ACTIVE COUNT on the trigger, which is what
 * keeps a collapsed filter from being an invisible one ("why are there only 3
 * products?").
 */
export function AdvancedFilters({
  activeCount,
  onClear,
  children,
  className,
  defaultOpen,
}: {
  activeCount: number;
  onClear: () => void;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
}) {
  // Open by default when arriving with filters already applied (a shared link,
  // a back-navigation) — a hidden panel would leave them unexplained.
  const [open, setOpen] = useState(defaultOpen ?? activeCount > 0);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-medium transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            activeCount > 0 && "border-primary/50",
          )}
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden />
          Filters
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold leading-none text-primary-foreground">
              {activeCount}
            </span>
          )}
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </button>
        )}
      </div>

      {open && (
        <div className="mt-3 grid gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
          {children}
        </div>
      )}
    </div>
  );
}
