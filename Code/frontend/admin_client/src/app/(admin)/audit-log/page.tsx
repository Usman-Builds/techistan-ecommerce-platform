"use client";

import { useMemo, useState } from "react";
import { ScrollText } from "lucide-react";
import { useAuditLogs } from "@/lib/api/hooks/audit";
import type { AuditLogEntry } from "@/lib/api/audit";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Pagination } from "@/components/ui/Pagination";
import { FilterBar, SearchInput } from "@/components/ui/FilterBar";
import { useDebouncedValue } from "@/lib/useDebouncedValue";

const PAGE_SIZE = 25;

function MetadataCell({ value }: { value: unknown }) {
  if (value == null) return <span className="text-muted-foreground">—</span>;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return (
    <code
      className="block max-w-[20rem] truncate rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
      title={text}
    >
      {text}
    </code>
  );
}

export default function AuditLogPage() {
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [page, setPage] = useState(1);
  const debouncedAction = useDebouncedValue(action, 300);
  const debouncedEntity = useDebouncedValue(entityType, 300);

  const query = useMemo(
    () => ({
      action: debouncedAction || undefined,
      entityType: debouncedEntity || undefined,
      page,
      pageSize: PAGE_SIZE,
    }),
    [debouncedAction, debouncedEntity, page],
  );

  const { data, isLoading, isError, refetch } = useAuditLogs(query);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  const columns: Column<AuditLogEntry>[] = [
    {
      key: "when",
      header: "When",
      cell: (a) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {new Date(a.createdAt).toLocaleString()}
        </span>
      ),
    },
    {
      key: "who",
      header: "Who",
      cell: (a) =>
        a.actor ? (
          <div>
            <div className="font-medium">
              {a.actor.firstName} {a.actor.lastName}
            </div>
            <div className="text-xs text-muted-foreground">{a.actor.email}</div>
          </div>
        ) : (
          <span className="text-muted-foreground">System</span>
        ),
    },
    {
      key: "action",
      header: "Action",
      cell: (a) => (
        <code className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
          {a.action}
        </code>
      ),
    },
    {
      key: "target",
      header: "Target",
      cell: (a) => (
        <span className="text-xs">
          <span className="font-medium">{a.entityType}</span>
          <span className="text-muted-foreground"> · {a.entityId}</span>
        </span>
      ),
    },
    {
      key: "details",
      header: "Details",
      cell: (a) => <MetadataCell value={a.metadata} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
        <ScrollText className="h-6 w-6" aria-hidden /> Audit log
      </h1>
      <p className="text-sm text-muted-foreground">
        Every admin mutation is recorded here — who did what, when, and to which record.
      </p>

      <FilterBar>
        <SearchInput
          value={action}
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          placeholder="Filter by action (e.g. order)…"
        />
        <SearchInput
          value={entityType}
          onChange={(v) => {
            setEntityType(v);
            setPage(1);
          }}
          placeholder="Filter by entity (e.g. Product)…"
        />
      </FilterBar>

      <DataTable
        columns={columns}
        data={data?.items}
        rowKey={(a) => a.id}
        loading={isLoading}
        error={isError}
        onRetry={refetch}
        emptyMessage="No audit entries match your filters."
        emptyIcon={ScrollText}
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
