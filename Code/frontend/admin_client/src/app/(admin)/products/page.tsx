"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Package, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminProducts,
  useBulkUpdateProducts,
  useDeleteProduct,
  useDuplicateProduct,
} from "@/lib/api/hooks/products";
import type {
  BulkAction,
  ProductListItem,
  ProductSort,
  ProductStatus,
  StockFilter,
} from "@/lib/api/products";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ExportButton } from "@/components/ui/ExportButton";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/FilterBar";
import {
  EMPTY_PRODUCT_FILTERS,
  ProductFilters,
  toProductParams,
  type ProductFilterState,
} from "@/components/products/ProductFilters";
import { productsCsvUrl } from "@/lib/api/exports";
import { formatPriceRange, dollarsToCents } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const PAGE_SIZE = 20;

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("newest");
  // Seeded from the URL so a link like /products?categoryId=… arrives with
  // that filter already applied — the category editor's "View these products"
  // link would otherwise land on an unfiltered list. Read once, as the initial
  // value: after mount the filter panel owns this state, and re-syncing from
  // the URL would fight the user's next click.
  const [filters, setFilters] = useState<ProductFilterState>(() => ({
    ...EMPTY_PRODUCT_FILTERS,
    categoryId: searchParams.get("categoryId"),
    status: (searchParams.get("status") as ProductStatus | null) ?? "",
    stock: (searchParams.get("stock") as StockFilter | null) ?? "",
    onSale: searchParams.get("onSale") === "true",
    uncategorized: searchParams.get("uncategorized") === "true",
  }));
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const debouncedSearch = useDebouncedValue(search, 300);

  // Dialog state
  const [deleteTarget, setDeleteTarget] = useState<ProductListItem | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [priceInput, setPriceInput] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);

  const params = useMemo(
    () => ({
      page,
      pageSize: PAGE_SIZE,
      search: debouncedSearch || undefined,
      sort,
      ...toProductParams(filters),
    }),
    [page, debouncedSearch, sort, filters],
  );

  // Any filter change re-queries from page 1 — staying on page 4 of a
  // now-two-page result set shows an empty table and looks like a bug.
  const applyFilters = (next: ProductFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const { data, isLoading, isError, refetch } = useAdminProducts(params);
  const del = useDeleteProduct();
  const duplicate = useDuplicateProduct();
  const bulk = useBulkUpdateProducts();

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const toggleRow = (id: string | number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = (ids: (string | number)[], checked: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => (checked ? next.add(id) : next.delete(id)));
      return next;
    });

  const runBulk = async (action: BulkAction, value?: number) => {
    const ids = [...selected].map(String);
    if (ids.length === 0) return;
    await bulk.mutateAsync({ ids, action, value });
    setSelected(new Set());
  };

  const confirmSetPrice = async () => {
    const cents = dollarsToCents(priceInput);
    if (cents == null || Number.isNaN(cents)) {
      setPriceError("Enter a valid non-negative price.");
      return;
    }
    await runBulk("setPrice", cents);
    setPriceOpen(false);
    setPriceInput("");
    setPriceError(null);
  };

  const columns: Column<ProductListItem>[] = [
    {
      key: "product",
      header: "Product",
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted">
            {p.primaryImage && (
              <Image
                src={p.primaryImage.url}
                alt={p.primaryImage.alt ?? p.title}
                fill
                sizes="40px"
                className="object-cover"
              />
            )}
          </div>
          <Link
            href={`/products/${p.id}`}
            className="font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.title}
          </Link>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (p) => (
        <span className="tabular-nums">{formatPriceRange(p.priceMin, p.priceMax)}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      cell: (p) => (
        <span className="text-muted-foreground">{p.category?.name ?? "—"}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (p) => (
        <div
          className="flex items-center justify-end gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <IconLink href={`/products/${p.id}`} label="Edit">
            <Pencil className="h-4 w-4" aria-hidden />
          </IconLink>
          <IconBtn
            label="Duplicate"
            onClick={() => duplicate.mutate(p.id)}
            disabled={duplicate.isPending}
          >
            <Copy className="h-4 w-4" aria-hidden />
          </IconBtn>
          <IconBtn label="Delete" danger onClick={() => setDeleteTarget(p)}>
            <Trash2 className="h-4 w-4" aria-hidden />
          </IconBtn>
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Package className="h-6 w-6" aria-hidden /> Products
        </h1>
        <div className="flex items-center gap-2">
          <ExportButton url={productsCsvUrl()} label="Export" />
          <Link
            href="/products/new"
            className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="h-4 w-4" aria-hidden /> New product
          </Link>
        </div>
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search products…"
        />
        <FilterSelect<ProductStatus>
          label="Filter by status"
          value={filters.status}
          onChange={(v) => applyFilters({ ...filters, status: v })}
          options={[
            { value: "", label: "All statuses" },
            { value: "DRAFT", label: "Draft" },
            { value: "ACTIVE", label: "Active" },
            { value: "ARCHIVED", label: "Archived" },
          ]}
        />
        <FilterSelect<ProductSort>
          label="Sort"
          value={sort}
          onChange={(v) => setSort(v)}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "title_asc", label: "Title A–Z" },
            { value: "title_desc", label: "Title Z–A" },
            { value: "price_asc", label: "Price, low to high" },
            { value: "price_desc", label: "Price, high to low" },
            { value: "top_rated", label: "Best rated" },
          ]}
        />
      </FilterBar>

      <ProductFilters
        state={filters}
        onChange={applyFilters}
        onClear={() => applyFilters(EMPTY_PRODUCT_FILTERS)}
      />

      <DataTable
        columns={columns}
        data={items}
        rowKey={(p) => p.id}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyMessage="No products found."
        emptyIcon={Package}
        onRowClick={(p) => router.push(`/products/${p.id}`)}
        selectable
        selectedIds={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        onClearSelection={() => setSelected(new Set())}
        bulkActions={
          <>
            <BulkBtn onClick={() => runBulk("activate")}>Activate</BulkBtn>
            <BulkBtn onClick={() => runBulk("archive")}>Archive</BulkBtn>
            <BulkBtn onClick={() => setPriceOpen(true)}>Set price</BulkBtn>
            <BulkBtn danger onClick={() => setBulkDeleteOpen(true)}>
              Delete
            </BulkBtn>
          </>
        }
      />

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} total={total} />

      {/* Single delete */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete product?"
        description={
          deleteTarget
            ? `"${deleteTarget.title}" and its variants/images will be permanently removed.`
            : ""
        }
        confirmLabel="Delete"
        tone="danger"
        loading={del.isPending}
        onConfirm={async () => {
          if (deleteTarget) await del.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Bulk delete */}
      <ConfirmDialog
        open={bulkDeleteOpen}
        title={`Delete ${selected.size} product(s)?`}
        description="This permanently removes the selected products."
        confirmLabel="Delete all"
        tone="danger"
        loading={bulk.isPending}
        onConfirm={async () => {
          await runBulk("delete");
          setBulkDeleteOpen(false);
        }}
        onCancel={() => setBulkDeleteOpen(false)}
      />

      {/* Bulk set price */}
      <ConfirmDialog
        open={priceOpen}
        title={`Set price for ${selected.size} product(s)`}
        description={
          <div className="space-y-2">
            <p>Every variant of the selected products will be set to this price.</p>
            <input
              type="number"
              min={0}
              step="0.01"
              autoFocus
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="19.99"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {priceError && <p className="text-destructive">{priceError}</p>}
          </div>
        }
        confirmLabel="Apply price"
        loading={bulk.isPending}
        onConfirm={confirmSetPrice}
        onCancel={() => {
          setPriceOpen(false);
          setPriceInput("");
          setPriceError(null);
        }}
      />
    </div>
  );
}

function BulkBtn({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        danger
          ? "rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
          : "rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted"
      }
    >
      {children}
    </button>
  );
}

function IconLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function IconBtn({
  label,
  children,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-50 " +
        (danger ? "hover:text-destructive" : "hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}
