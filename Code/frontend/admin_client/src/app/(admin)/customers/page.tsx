"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { useCustomers } from "@/lib/api/hooks/customers";
import type { CustomerListItem, UserStatus } from "@/lib/api/customers";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { FilterBar, FilterSelect, SearchInput } from "@/components/ui/FilterBar";
import { ExportButton } from "@/components/ui/ExportButton";
import { customersCsvUrl } from "@/lib/api/exports";
import { formatCents } from "@/lib/format";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const PAGE_SIZE = 20;

export default function CustomersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | UserStatus>("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(search, 300);

  const query = useMemo(
    () => ({
      search: debouncedSearch || undefined,
      status: status || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedSearch, status, page],
  );

  const { data, isLoading, isError, isFetching, refetch } = useCustomers(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const columns: Column<CustomerListItem>[] = [
    {
      key: "name",
      header: "Customer",
      cell: (c) => (
        <div>
          <div className="font-medium">
            {c.firstName} {c.lastName}
          </div>
          <div className="text-xs text-muted-foreground">{c.email}</div>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (c) => <StatusBadge status={c.status} />,
    },
    {
      key: "orders",
      header: "Orders",
      align: "right",
      cell: (c) => <span className="tabular-nums">{c.orderCount}</span>,
    },
    {
      key: "spend",
      header: "Total spent",
      align: "right",
      cell: (c) => (
        <span className="tabular-nums">{formatCents(c.totalSpentCents)}</span>
      ),
    },
    {
      key: "joined",
      header: "Joined",
      align: "right",
      cell: (c) => (
        <span className="text-muted-foreground">
          {new Date(c.createdAt).toLocaleDateString()}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
          <Users className="h-6 w-6" aria-hidden /> Customers
        </h1>
        <ExportButton url={customersCsvUrl()} label="Export customers" />
      </div>

      <FilterBar>
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Search name or email…"
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={(v) => {
            setStatus(v as "" | UserStatus);
            setPage(1);
          }}
          options={[
            { value: "", label: "All statuses" },
            { value: "ACTIVE", label: "Active" },
            { value: "BANNED", label: "Banned" },
          ]}
        />
        {isFetching && !isLoading && (
          <span className="text-xs text-muted-foreground">Updating…</span>
        )}
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(c) => c.id}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyMessage="No customers match your filters."
        emptyIcon={Users}
        onRowClick={(c) => router.push(`/customers/${c.id}`)}
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
