"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Globe, Plus, Ticket, Wand2 } from "lucide-react";
import {
  useBulkCoupons,
  useCouponBatches,
  useCoupons,
  useToggleCoupon,
} from "@/lib/api/hooks/promotions";
import type {
  Coupon,
  CouponStatusFilter,
  CouponType,
  PromotionScope,
} from "@/lib/api/promotions";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  AdvancedFilters,
  FilterBar,
  FilterSelect,
  SearchInput,
} from "@/components/ui/FilterBar";
import { Field } from "@/components/ui/Form";
import { ScopeSummary } from "@/components/promotions/PromotionScopeFields";
import { GenerateCouponsDialog } from "@/components/promotions/GenerateCouponsDialog";
import { formatCents } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const PAGE_SIZE = 20;

function valueLabel(c: Coupon): string {
  if (c.type === "PERCENT") return `${c.value}%`;
  if (c.type === "FIXED") return formatCents(c.value);
  return "Free shipping";
}

/**
 * A coupon's real state, which is not the same as its `active` flag: a coupon
 * can be flagged active and still be dead because it expired, or alive-but-
 * waiting because it starts next week. Showing only the flag is what makes
 * "why isn't my code working?" a support ticket.
 */
function lifecycle(c: Coupon): { label: string; tone: "success" | "warning" | "danger" | "neutral" } {
  const now = Date.now();
  if (!c.active) return { label: "Inactive", tone: "neutral" };
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) {
    return { label: "Expired", tone: "danger" };
  }
  if (c.startsAt && new Date(c.startsAt).getTime() > now) {
    return { label: "Scheduled", tone: "warning" };
  }
  if (c.usageLimit != null && c.usedCount >= c.usageLimit) {
    return { label: "Used up", tone: "danger" };
  }
  return { label: "Active", tone: "success" };
}

export default function CouponsPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CouponStatusFilter | "">("");
  const [scope, setScope] = useState<PromotionScope | "">("");
  const [type, setType] = useState<CouponType | "">("");
  const [batchId, setBatchId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string | number>>(new Set());
  const [generateOpen, setGenerateOpen] = useState(false);
  // Bumped on every open so the dialog remounts with an empty form rather than
  // resetting itself in an effect.
  const [generateKey, setGenerateKey] = useState(0);
  const [bulkDelete, setBulkDelete] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 300);
  const toggle = useToggleCoupon();
  const bulk = useBulkCoupons();
  const { data: batches } = useCouponBatches();

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status || undefined,
      scope: scope || undefined,
      type: type || undefined,
      batchId: batchId || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, status, scope, type, batchId, page],
  );

  const { data, isLoading, isError, refetch } = useCoupons(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const activeFilters =
    (scope ? 1 : 0) + (type ? 1 : 0) + (batchId ? 1 : 0);

  const runBulk = async (action: "activate" | "deactivate" | "delete") => {
    const ids = [...selected].map(String);
    if (ids.length === 0) return;
    await bulk.mutateAsync({ action, ids });
    setSelected(new Set());
  };

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

  const columns: Column<Coupon>[] = [
    {
      key: "code",
      header: "Code",
      cell: (c) => (
        <div className="min-w-0">
          <Link
            href={`/coupons/${c.id}`}
            className="font-mono font-medium hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {c.code}
          </Link>
          {c.name && (
            <p className="truncate text-xs text-muted-foreground">{c.name}</p>
          )}
        </div>
      ),
    },
    { key: "value", header: "Discount", cell: (c) => valueLabel(c) },
    {
      key: "scope",
      header: "Applies to",
      cell: (c) => <ScopeSummary scope={c.scope} counts={c._count} />,
    },
    {
      key: "usage",
      header: "Used",
      cell: (c) => (
        <span className="tabular-nums text-muted-foreground">
          {c.usedCount}
          {c.usageLimit != null ? ` / ${c.usageLimit}` : ""}
        </span>
      ),
    },
    {
      key: "window",
      header: "Window",
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.expiresAt
            ? `Until ${new Date(c.expiresAt).toLocaleDateString("en-US")}`
            : "No expiry"}
        </span>
      ),
    },
    {
      key: "state",
      header: "Status",
      cell: (c) => {
        const state = lifecycle(c);
        return (
          <div className="flex items-center gap-1.5">
            <StatusBadge status={state.label} tone={state.tone} />
            {c.isPublic && (
              <span
                title="Advertised on the storefront"
                className="text-primary"
              >
                <Globe className="h-3.5 w-3.5" aria-hidden />
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "",
      align: "right",
      cell: (c) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle.mutate(c.id);
          }}
          disabled={toggle.isPending}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {c.active ? "Deactivate" : "Activate"}
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Ticket className="h-6 w-6" aria-hidden /> Coupons
        </h1>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setGenerateKey((k) => k + 1);
              setGenerateOpen(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            <Wand2 className="h-4 w-4" aria-hidden /> Generate codes
          </button>
          <Link
            href="/coupons/new"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" aria-hidden /> New coupon
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
          placeholder="Search code or name…"
        />
        <FilterSelect<CouponStatusFilter>
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "All statuses" },
            { value: "active", label: "Active" },
            { value: "inactive", label: "Inactive" },
            { value: "scheduled", label: "Scheduled" },
            { value: "expired", label: "Expired" },
          ]}
        />
      </FilterBar>

      <AdvancedFilters
        activeCount={activeFilters}
        onClear={() => {
          setScope("");
          setType("");
          setBatchId("");
          setPage(1);
        }}
      >
        <Field label="Applies to">
          <FilterSelect<PromotionScope>
            label="Scope"
            className="w-full"
            value={scope}
            onChange={(v) => {
              setScope(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Any scope" },
              { value: "ALL", label: "Everything" },
              { value: "CATEGORY", label: "Specific categories" },
              { value: "PRODUCT", label: "Specific products" },
            ]}
          />
        </Field>

        <Field label="Discount type">
          <FilterSelect<CouponType>
            label="Discount type"
            className="w-full"
            value={type}
            onChange={(v) => {
              setType(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Any type" },
              { value: "PERCENT", label: "Percentage off" },
              { value: "FIXED", label: "Fixed amount off" },
              { value: "FREE_SHIPPING", label: "Free shipping" },
            ]}
          />
        </Field>

        <Field
          label="Generated batch"
          hint="Codes minted together in one run."
          className="sm:col-span-2"
        >
          <FilterSelect
            label="Generated batch"
            className="w-full"
            searchable
            value={batchId}
            onChange={(v) => {
              setBatchId(v);
              setPage(1);
            }}
            options={[
              { value: "", label: "Any batch" },
              ...(batches ?? []).map((b) => ({
                value: b.batchId,
                label:
                  b.name ??
                  `Batch of ${b.count} — ${new Date(b.createdAt).toLocaleDateString("en-US")}`,
                hint: String(b.count),
              })),
            ]}
          />
        </Field>
      </AdvancedFilters>

      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyMessage="No coupons match your filters."
        emptyIcon={Ticket}
        onRowClick={(c) => router.push(`/coupons/${c.id}`)}
        selectable
        selectedIds={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        onClearSelection={() => setSelected(new Set())}
        bulkActions={
          <>
            <BulkBtn onClick={() => runBulk("activate")}>Activate</BulkBtn>
            <BulkBtn onClick={() => runBulk("deactivate")}>Deactivate</BulkBtn>
            <BulkBtn danger onClick={() => setBulkDelete(true)}>
              Delete
            </BulkBtn>
          </>
        }
      />

      <Pagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        total={data?.total}
      />

      <GenerateCouponsDialog
        key={generateKey}
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
      />

      <ConfirmDialog
        open={bulkDelete}
        title={`Delete ${selected.size} coupon${selected.size === 1 ? "" : "s"}?`}
        description="Their redemption history is deleted with them. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={bulk.isPending}
        onConfirm={async () => {
          await runBulk("delete");
          setBulkDelete(false);
        }}
        onCancel={() => setBulkDelete(false)}
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
