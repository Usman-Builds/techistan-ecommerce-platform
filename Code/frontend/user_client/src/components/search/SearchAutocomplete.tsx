"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { useSuggest } from "@/lib/api/hooks/search";
import type { Suggestion } from "@/lib/api/search";
import { cn } from "@/lib/utils";

/** Debounce window for suggestions — NFR-106 requires ≤200ms. */
const DEBOUNCE_MS = 180;

/**
 * Header autocomplete (FR-223). Debounced ≤200ms, keyboard-navigable (↑/↓/Enter/
 * Esc), grouped product + category suggestions. Stale in-flight requests are
 * cancelled automatically by TanStack Query (the query signal is forwarded to
 * fetch). Product suggestions link to the PDP (script 14); category suggestions
 * open a filtered search.
 */
export function SearchAutocomplete({
  initialQuery = "",
  autoFocus = false,
}: {
  initialQuery?: string;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [debounced, setDebounced] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Debounce the query fed to the suggest endpoint.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [value]);

  const { data: suggestions = [], isFetching } = useSuggest(
    open ? debounced : "",
  );

  // Reset the active row whenever the suggestion set changes.
  useEffect(() => {
    setActive(-1);
  }, [suggestions]);

  // Close on outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const submitSearch = (q: string) => {
    const term = q.trim();
    if (!term) return;
    close();
    router.push(`/search?q=${encodeURIComponent(term)}`);
  };

  const selectSuggestion = (s: Suggestion) => {
    close();
    if (s.type === "product") router.push(`/products/${s.slug}`);
    else router.push(`/search?category=${encodeURIComponent(s.slug)}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(a + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, -1));
    } else if (e.key === "Enter") {
      if (open && active >= 0 && suggestions[active]) {
        e.preventDefault();
        selectSuggestion(suggestions[active]);
      } else {
        submitSearch(value);
      }
    } else if (e.key === "Escape") {
      close();
    }
  };

  const products = suggestions.filter((s) => s.type === "product");
  const categories = suggestions.filter((s) => s.type === "category");
  const showDropdown = open && value.trim().length >= 1;

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <input
          type="search"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            active >= 0 ? `${listboxId}-opt-${active}` : undefined
          }
          autoFocus={autoFocus}
          value={value}
          placeholder="Search products…"
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-9 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {isFetching && (
          <Loader2
            className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground"
            aria-hidden
          />
        )}
      </div>

      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute z-20 mt-1 max-h-96 w-full overflow-auto rounded-md border border-border bg-card py-1 shadow-lg"
        >
          {suggestions.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              {isFetching ? "Searching…" : "No matches"}
            </li>
          ) : (
            <>
              {products.length > 0 && (
                <li
                  className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  aria-hidden
                >
                  Products
                </li>
              )}
              {products.map((s) => {
                const idx = suggestions.indexOf(s);
                return (
                  <SuggestionRow
                    key={s.id}
                    id={`${listboxId}-opt-${idx}`}
                    suggestion={s}
                    active={active === idx}
                    onMouseEnter={() => setActive(idx)}
                    onSelect={() => selectSuggestion(s)}
                  />
                );
              })}

              {categories.length > 0 && (
                <li
                  className="px-3 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  aria-hidden
                >
                  Categories
                </li>
              )}
              {categories.map((s) => {
                const idx = suggestions.indexOf(s);
                return (
                  <SuggestionRow
                    key={s.id}
                    id={`${listboxId}-opt-${idx}`}
                    suggestion={s}
                    active={active === idx}
                    onMouseEnter={() => setActive(idx)}
                    onSelect={() => selectSuggestion(s)}
                  />
                );
              })}
            </>
          )}
        </ul>
      )}
    </div>
  );
}

function SuggestionRow({
  id,
  suggestion,
  active,
  onMouseEnter,
  onSelect,
}: {
  id: string;
  suggestion: Suggestion;
  active: boolean;
  onMouseEnter: () => void;
  onSelect: () => void;
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={active}
      onMouseEnter={onMouseEnter}
      onMouseDown={(e) => {
        // Prevent the input blur from closing the list before the click lands.
        e.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
        active ? "bg-primary/10 text-foreground" : "text-foreground",
      )}
    >
      <span className="truncate">{suggestion.title}</span>
    </li>
  );
}
