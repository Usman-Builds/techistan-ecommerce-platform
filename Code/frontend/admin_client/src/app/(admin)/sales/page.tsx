"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Loader2, Tags } from "lucide-react";
import { useAdminProducts } from "@/lib/api/hooks/products";
import { formatPriceRange } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { SalePanel } from "@/components/promotions/SalePanel";
import { BulkSalePanel } from "@/components/promotions/BulkSalePanel";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/FilterBar";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Panel } from "@/components/ui/Form";

export default function SalesPage() {
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [onSaleOnly, setOnSaleOnly] = useState<"" | "sale">("");
  const [openId, setOpenId] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);

  const params = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      categoryId: categoryId ?? undefined,
      onSale: onSaleOnly === "sale" || undefined,
      pageSize: 20,
    }),
    [debouncedSearch, categoryId, onSaleOnly],
  );

  const { data, isLoading, isError } = useAdminProducts(params);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Tags className="h-6 w-6" aria-hidden /> Sales
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          While a sale is active the sale price is the effective price, and the
          regular price is shown as a strike-through compare-at on the
          storefront.
        </p>
      </div>

      {/* The bulk runner comes first because it is the one a seasonal sale
       * actually needs; the per-product list below is for the exceptions. */}
      <BulkSalePanel />

      <Panel
        title="Individual products"
        description="Override or check a single product's sale."
      >
        <div className="space-y-4">
          <FilterBar>
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Search products…"
            />
            <FilterSelect<"sale">
              label="Sale state"
              value={onSaleOnly}
              onChange={setOnSaleOnly}
              options={[
                { value: "", label: "All products" },
                { value: "sale", label: "On sale only" },
              ]}
            />
            <div className="min-w-[14rem]">
              <CategoryPicker
                label="Filter by category"
                value={categoryId}
                onChange={setCategoryId}
                placeholder="Any category"
                noneLabel="Any category"
              />
            </div>
          </FilterBar>

          {isLoading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
            </div>
          ) : isError ? (
            <p className="py-12 text-center text-destructive">
              Failed to load products.
            </p>
          ) : !data || data.items.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No products match your filters.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.items.map((p) => {
                const open = openId === p.id;
                return (
                  <li
                    key={p.id}
                    className="rounded-lg border border-border bg-background"
                  >
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : p.id)}
                      aria-expanded={open}
                      className="flex w-full items-center justify-between gap-3 p-4 text-left"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium">
                            {p.title}
                          </span>
                          {p.onSale && (
                            <StatusBadge status="On sale" tone="warning" />
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {formatPriceRange(p.priceMin, p.priceMax)}
                          {p.category ? ` · ${p.category.name}` : ""}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                        aria-hidden
                      />
                    </button>
                    {open && (
                      <div className="border-t border-border p-4">
                        <SalePanel product={p} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Panel>
    </div>
  );
}
