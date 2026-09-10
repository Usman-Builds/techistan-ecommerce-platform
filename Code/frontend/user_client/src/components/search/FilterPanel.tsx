"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { SearchFacets, SearchQuery } from "@/lib/api/search";
import { formatCents } from "@/lib/format";
import { centsToDollars, dollarsToCents } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Faceted filter panel (FR-221). Categories and brands are multi-select with
 * live counts; price offers both facet buckets (with counts) and a custom
 * min/max range; rating is "N stars & up"; availability is in-stock-only. Every
 * change is pushed up via `onChange` (which the search view syncs to the URL).
 */
export function FilterPanel({
  facets,
  filters,
  onChange,
  onClear,
}: {
  facets: SearchFacets;
  filters: SearchQuery;
  onChange: (patch: Partial<SearchQuery>) => void;
  onClear: () => void;
}) {
  const selectedCategories = new Set(filters.category ?? []);
  const selectedBrands = new Set(filters.brand ?? []);

  const toggle = (list: string[] | undefined, value: string) => {
    const set = new Set(list ?? []);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    return set.size ? [...set] : undefined;
  };

  const hasActive =
    (filters.category?.length ?? 0) > 0 ||
    (filters.brand?.length ?? 0) > 0 ||
    filters.minPrice != null ||
    filters.maxPrice != null ||
    filters.rating != null ||
    !!filters.inStock;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-heading text-base font-semibold">Filters</h2>
        {hasActive && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" aria-hidden /> Clear all
          </button>
        )}
      </div>

      {/* Availability */}
      <Section title="Availability">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={!!filters.inStock}
            onChange={(e) => onChange({ inStock: e.target.checked || undefined })}
            className="h-4 w-4 rounded border-input"
          />
          <span>In stock only</span>
          <span className="ml-auto text-xs text-muted-foreground">
            {facets.inStock}
          </span>
        </label>
      </Section>

      {/* Categories */}
      {facets.categories.length > 0 && (
        <Section title="Category">
          <ul className="space-y-1.5">
            {facets.categories.map((c) => (
              <li key={c.slug}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedCategories.has(c.slug)}
                    onChange={() =>
                      onChange({ category: toggle(filters.category, c.slug) })
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate">{c.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {c.count}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Brands */}
      {facets.brands.length > 0 && (
        <Section title="Brand">
          <ul className="space-y-1.5">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedBrands.has(b.slug)}
                    onChange={() =>
                      onChange({ brand: toggle(filters.brand, b.slug) })
                    }
                    className="h-4 w-4 rounded border-input"
                  />
                  <span className="truncate">{b.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {b.count}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Price */}
      <Section title="Price">
        <ul className="space-y-1.5">
          <li>
            <PriceOption
              label="Any price"
              count={null}
              selected={filters.minPrice == null && filters.maxPrice == null}
              onSelect={() => onChange({ minPrice: undefined, maxPrice: undefined })}
            />
          </li>
          {facets.priceBuckets.map((b) => {
            const selected =
              filters.minPrice === b.min &&
              (filters.maxPrice ?? null) === b.max;
            const label =
              b.max == null
                ? `${formatCents(b.min)}+`
                : `${formatCents(b.min)} – ${formatCents(b.max)}`;
            return (
              <li key={`${b.min}-${b.max}`}>
                <PriceOption
                  label={label}
                  count={b.count}
                  selected={selected}
                  onSelect={() =>
                    onChange({ minPrice: b.min, maxPrice: b.max ?? undefined })
                  }
                />
              </li>
            );
          })}
        </ul>
        <CustomPriceRange filters={filters} onChange={onChange} />
      </Section>

      {/* Rating */}
      <Section title="Rating">
        <ul className="space-y-1.5">
          <li>
            <RatingOption
              label="Any rating"
              count={null}
              selected={filters.rating == null}
              onSelect={() => onChange({ rating: undefined })}
            />
          </li>
          {facets.ratings.map((r) => (
            <li key={r.min}>
              <RatingOption
                label={`${r.min} ★ & up`}
                count={r.count}
                selected={filters.rating === r.min}
                onSelect={() => onChange({ rating: r.min })}
              />
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}

function PriceOption({
  label,
  count,
  selected,
  onSelect,
}: {
  label: string;
  count: number | null;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors",
        selected
          ? "bg-primary/10 font-medium text-foreground"
          : "hover:bg-muted",
      )}
    >
      <span className="truncate">{label}</span>
      {count != null && (
        <span className="ml-auto text-xs text-muted-foreground">{count}</span>
      )}
    </button>
  );
}

const RatingOption = PriceOption;

/** Custom min/max price inputs (dollars → integer cents). */
function CustomPriceRange({
  filters,
  onChange,
}: {
  filters: SearchQuery;
  onChange: (patch: Partial<SearchQuery>) => void;
}) {
  const [min, setMin] = useState<string>(
    filters.minPrice != null ? String(centsToDollars(filters.minPrice)) : "",
  );
  const [max, setMax] = useState<string>(
    filters.maxPrice != null ? String(centsToDollars(filters.maxPrice)) : "",
  );

  // Keep local inputs in sync when filters change from elsewhere (e.g. buckets).
  useEffect(() => {
    setMin(filters.minPrice != null ? String(centsToDollars(filters.minPrice)) : "");
    setMax(filters.maxPrice != null ? String(centsToDollars(filters.maxPrice)) : "");
  }, [filters.minPrice, filters.maxPrice]);

  const apply = () => {
    const minVal = min.trim() === "" ? undefined : dollarsToCents(Number(min));
    const maxVal = max.trim() === "" ? undefined : dollarsToCents(Number(max));
    onChange({
      minPrice: Number.isFinite(minVal as number) ? minVal : undefined,
      maxPrice: Number.isFinite(maxVal as number) ? maxVal : undefined,
    });
  };

  return (
    <div className="mt-2 flex items-end gap-2">
      <label className="flex-1 text-xs text-muted-foreground">
        Min $
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <label className="flex-1 text-xs text-muted-foreground">
        Max $
        <input
          type="number"
          min={0}
          inputMode="decimal"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>
      <button
        type="button"
        onClick={apply}
        className="rounded-md border border-border bg-background px-3 py-1 text-sm font-medium hover:bg-muted"
      >
        Go
      </button>
    </div>
  );
}
