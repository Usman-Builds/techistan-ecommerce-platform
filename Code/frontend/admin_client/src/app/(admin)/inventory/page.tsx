"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Boxes,
  Check,
  Layers,
  Loader2,
  PackageX,
  Wallet,
} from "lucide-react";
import { useAdjustStock, useInventory } from "@/lib/api/hooks/inventory";
import type {
  InventoryItem,
  InventorySort,
  InventoryStockFilter,
} from "@/lib/api/inventory";
import type { ProductStatus } from "@/lib/api/products";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { StatCard } from "@/components/ui/StatCard";
import {
  AdvancedFilters,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/ui/FilterBar";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { Field, Input } from "@/components/ui/Form";
import { ExportButton } from "@/components/ui/ExportButton";
import { productsCsvUrl } from "@/lib/api/exports";
import { formatCents } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const PAGE_SIZE = 30;

/**
 * Filters the inventory screen supports, as one object.
 *
 * The screen previously had a text box and a "low stock only" checkbox, which
 * answers "what is running out?" but not the question an admin actually arrives
 * with — "what is running out IN THIS CATEGORY", or "which draft products still
 * hold stock". Those need the catalog dimensions below.
 */
interface InventoryFilterState {
  stock: InventoryStockFilter | "";
  categoryId: string | null;
  productStatus: ProductStatus | "";
  minStock: string;
  maxStock: string;
}

const EMPTY_FILTERS: InventoryFilterState = {
  stock: "",
  categoryId: null,
  productStatus: "",
  minStock: "",
  maxStock: "",
};

function countActive(state: InventoryFilterState): number {
  let n = 0;
  if (state.stock) n++;
  if (state.categoryId) n++;
  if (state.productStatus) n++;
  if (state.minStock.trim() || state.maxStock.trim()) n++;
  return n;
}

function intOrUndefined(input: string): number | undefined {
  const value = parseInt(input, 10);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

function StockCell({ item }: { item: InventoryItem }) {
  const adjust = useAdjustStock();
  const [value, setValue] = useState(String(item.stock));
  const dirty = value !== String(item.stock) && value.trim() !== "";

  // Keep the input in sync when the underlying (optimistic/reconciled) value changes
  // and the user isn't mid-edit.
  const [lastServer, setLastServer] = useState(item.stock);
  if (item.stock !== lastServer) {
    setLastServer(item.stock);
    if (!dirty) setValue(String(item.stock));
  }

  const save = () => {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 0) return;
    adjust.mutate({ variantId: item.variantId, stock: n });
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
      <input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
        aria-label={`Stock for ${item.sku}`}
        className="w-20 rounded-md border border-input bg-background px-2 py-1 text-right text-sm tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <button
        type="button"
        onClick={save}
        disabled={!dirty || adjust.isPending}
        aria-label="Save stock"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-border text-muted-foreground hover:bg-muted disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {adjust.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Check className="h-4 w-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

export default function InventoryPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<InventorySort>("stock_asc");
  const [filters, setFilters] = useState<InventoryFilterState>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const apply = (next: InventoryFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      stock: filters.stock || undefined,
      categoryId: filters.categoryId ?? undefined,
      productStatus: filters.productStatus || undefined,
      minStock: intOrUndefined(filters.minStock),
      maxStock: intOrUndefined(filters.maxStock),
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, filters, sort, page],
  );

  const { data, isLoading, isError, refetch } = useInventory(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const totals = data?.totals;

  const columns: Column<InventoryItem>[] = [
    {
      key: "product",
      header: "Product",
      cell: (it) => (
        <div>
          <Link
            href={`/products/${it.productId}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {it.productTitle}
          </Link>
          <div className="text-xs text-muted-foreground">
            {it.sku}
            {it.options
              ? " · " +
                Object.entries(it.options)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(", ")
              : ""}
          </div>
        </div>
      ),
    },
    {
      key: "productStatus",
      header: "Product status",
      cell: (it) => <StatusBadge status={it.productStatus} />,
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (it) => (
        <span className="tabular-nums">{formatCents(it.priceCents)}</span>
      ),
    },
    {
      key: "value",
      header: "Stock value",
      align: "right",
      headerClassName: "text-right",
      // Capital sitting in this line. It is the number that tells you which
      // low-stock row to reorder first, and it is not derivable at a glance
      // from price and quantity in two separate columns.
      cell: (it) => (
        <span className="tabular-nums text-muted-foreground">
          {formatCents(it.priceCents * it.stock)}
        </span>
      ),
    },
    {
      key: "flag",
      header: "Level",
      cell: (it) =>
        it.stock === 0 ? (
          <StatusBadge status="Out" tone="danger" />
        ) : it.lowStock ? (
          <StatusBadge status="Low" tone="warning" />
        ) : (
          <StatusBadge status="OK" tone="success" />
        ),
    },
    {
      key: "stock",
      header: "Stock",
      align: "right",
      headerClassName: "text-right",
      cell: (it) => <StockCell item={it} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Boxes className="h-6 w-6" aria-hidden /> Inventory
        </h1>
        <ExportButton url={productsCsvUrl()} label="Export products" />
      </div>

      {/* Totals describe the FILTERED set, so narrowing to a category answers
       * "how much stock and how much capital is in it" rather than repeating
       * the same store-wide numbers on every view. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Variants"
          value={totals?.variants ?? 0}
          icon={Layers}
          loading={isLoading}
          hint={
            data ? `Low-stock threshold: ${data.threshold} units` : undefined
          }
        />
        <StatCard
          label="Units on hand"
          value={(totals?.units ?? 0).toLocaleString()}
          icon={Boxes}
          loading={isLoading}
        />
        <StatCard
          label="Stock value"
          value={formatCents(totals?.retailValueCents ?? 0)}
          icon={Wallet}
          loading={isLoading}
          hint="At current selling prices"
        />
        <StatCard
          label="Needs attention"
          value={(totals?.lowStock ?? 0) + (totals?.outOfStock ?? 0)}
          icon={totals?.outOfStock ? PackageX : AlertTriangle}
          loading={isLoading}
          hint={
            totals
              ? `${totals.lowStock} low · ${totals.outOfStock} out of stock`
              : undefined
          }
        />
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search SKU or product…"
        />
        <FilterSelect<InventoryStockFilter>
          label="Stock level"
          value={filters.stock}
          onChange={(v) => apply({ ...filters, stock: v })}
          options={[
            { value: "", label: "All stock levels" },
            { value: "low", label: "Low stock" },
            { value: "out", label: "Out of stock" },
            { value: "in", label: "Healthy stock" },
          ]}
        />
        <FilterSelect<InventorySort>
          label="Sort"
          value={sort}
          onChange={setSort}
          options={[
            { value: "stock_asc", label: "Lowest stock first" },
            { value: "stock_desc", label: "Highest stock first" },
            { value: "value_desc", label: "Most stock value" },
            { value: "title_asc", label: "Product A–Z" },
            { value: "sku_asc", label: "SKU A–Z" },
            { value: "price_desc", label: "Price, high to low" },
            { value: "price_asc", label: "Price, low to high" },
          ]}
        />
      </FilterBar>

      <AdvancedFilters
        activeCount={countActive(filters)}
        onClear={() => apply(EMPTY_FILTERS)}
      >
        <Field
          label="Category"
          hint="Includes everything filed underneath it."
          className="sm:col-span-2"
        >
          <CategoryPicker
            label="Filter by category"
            value={filters.categoryId}
            onChange={(id) => apply({ ...filters, categoryId: id })}
            placeholder="Any category"
            noneLabel="Any category"
          />
        </Field>

        <Field label="Product status">
          <FilterSelect<ProductStatus>
            label="Product status"
            className="w-full"
            value={filters.productStatus}
            onChange={(v) => apply({ ...filters, productStatus: v })}
            options={[
              { value: "", label: "Any status" },
              { value: "ACTIVE", label: "Active" },
              { value: "DRAFT", label: "Draft" },
              { value: "ARCHIVED", label: "Archived" },
            ]}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min units" htmlFor="min-stock">
            <Input
              id="min-stock"
              type="number"
              min={0}
              placeholder="0"
              value={filters.minStock}
              onChange={(e) => apply({ ...filters, minStock: e.target.value })}
            />
          </Field>
          <Field label="Max units" htmlFor="max-stock">
            <Input
              id="max-stock"
              type="number"
              min={0}
              placeholder="Any"
              value={filters.maxStock}
              onChange={(e) => apply({ ...filters, maxStock: e.target.value })}
            />
          </Field>
        </div>
      </AdvancedFilters>

      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(it) => it.variantId}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyMessage="No variants match your filters."
        emptyIcon={Boxes}
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={data?.total}
      />
    </div>
  );
}
