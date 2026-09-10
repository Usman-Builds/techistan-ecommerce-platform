"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { Package } from "lucide-react";
import { useAdminProducts } from "@/lib/api/hooks/products";
import { formatPriceRange } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { MultiSelect } from "./MultiSelect";
import type { SelectOption } from "./Select";

const PAGE_SIZE = 25;

/**
 * Multi-product picker, backed by server-side search.
 *
 * Products are the one list that cannot be shipped to the browser up front — a
 * real catalog is thousands of rows — so this searches remotely and shows the
 * most recent products before anything is typed.
 *
 * The interesting part is the LABEL CACHE. A coupon scoped to nine products
 * loads holding nine ids; the first search returns 25 unrelated products, and
 * without a cache the nine chips would render as raw cuids and an admin could
 * save a scope they never actually saw. So every product this picker has ever
 * seen is remembered for the lifetime of the form, and remembered rows are
 * merged into the option list. Ids that were never resolved still render (as
 * ids) rather than being dropped, because silently discarding a restriction is
 * the worse failure.
 */
export function ProductPicker({
  values,
  onChange,
  id,
  label = "Products",
  placeholder = "Choose products…",
  className,
  disabled,
  max,
}: {
  values: string[];
  onChange: (ids: string[]) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  max?: number;
}) {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 300);

  const { data, isFetching } = useAdminProducts({
    page: 1,
    pageSize: PAGE_SIZE,
    search: debounced || undefined,
    sort: debounced ? "relevance" : "newest",
  });

  const items = data?.items;

  const rows = useMemo(
    () =>
      (items ?? []).map(
        (product): SelectOption => ({
          value: product.id,
          label: product.title,
          description: product.category?.name ?? "Uncategorized",
          hint: formatPriceRange(product.priceMin, product.priceMax),
          icon: <Thumb url={product.primaryImage?.url} alt={product.title} />,
        }),
      ),
    [items],
  );

  // id → row for everything seen so far. Held as STATE and adjusted during
  // render (React's documented "derive state from props" escape hatch) rather
  // than in a ref: a ref read during render is not a legal dependency, and an
  // effect would cost an extra render pass on every keystroke.
  const [cache, setCache] = useState<Map<string, SelectOption>>(new Map());
  // Starts as null, not as `rows`, so the FIRST page of results is cached too —
  // seeding it with the current rows would skip them and quietly lose the
  // labels for whatever was on screen when the form opened.
  const [lastRows, setLastRows] = useState<SelectOption[] | null>(null);
  if (rows !== lastRows) {
    setLastRows(rows);
    if (rows.length > 0) {
      const next = new Map(cache);
      for (const row of rows) next.set(row.value, row);
      setCache(next);
    }
  }

  const options = useMemo(() => {
    // Selected products this page of results doesn't contain are appended from
    // the cache, so their chips keep their names while the admin searches for
    // something else.
    const present = new Set(rows.map((r) => r.value));
    const remembered = values
      .filter((v) => !present.has(v))
      .map((v) => cache.get(v))
      .filter((row): row is SelectOption => Boolean(row));
    return [...remembered, ...rows];
  }, [rows, values, cache]);

  return (
    <MultiSelect
      id={id}
      label={label}
      className={className}
      disabled={disabled}
      values={values}
      onChange={onChange}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Search products…"
      emptyMessage="No products match."
      onSearch={setSearch}
      loading={isFetching}
      max={max}
    />
  );
}

/** 20px product thumbnail, or a neutral placeholder when there is no image. */
function Thumb({ url, alt }: { url?: string; alt: string }) {
  if (!url) {
    return (
      <span className="grid h-6 w-6 place-items-center rounded bg-muted">
        <Package className="h-3 w-3" aria-hidden />
      </span>
    );
  }
  return (
    <span className="relative block h-6 w-6 overflow-hidden rounded bg-muted">
      <Image src={url} alt={alt} fill sizes="24px" className="object-cover" />
    </span>
  );
}
