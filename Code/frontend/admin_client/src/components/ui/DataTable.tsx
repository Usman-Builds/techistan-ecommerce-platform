"use client";

import { useEffect, useRef } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Inbox, RotateCcw, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "./Skeleton";

export type SortDir = "asc" | "desc";
export interface SortState {
  key: string;
  dir: SortDir;
}

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  sortable?: boolean;
  /** Sort key emitted on click; defaults to `key`. */
  sortKey?: string;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[] | undefined;
  rowKey: (row: T) => string | number;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  emptyMessage?: React.ReactNode;
  emptyIcon?: LucideIcon;
  skeletonRows?: number;

  // Row selection (bulk actions)
  selectable?: boolean;
  selectedIds?: Set<string | number>;
  onToggleRow?: (id: string | number) => void;
  onToggleAll?: (ids: (string | number)[], checked: boolean) => void;
  onClearSelection?: () => void;
  bulkActions?: React.ReactNode;

  // Server-driven sort
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;

  onRowClick?: (row: T) => void;
}

const alignClass = { left: "text-left", right: "text-right", center: "text-center" };

/**
 * Reusable accessible data table (script 15, Task 2). One component backs every
 * admin list: server-driven sort, bulk row selection with a sticky action bar,
 * sticky header, keyboard-activatable rows, and built-in loading / empty / error
 * states. Pagination is a sibling (see Pagination).
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  error,
  onRetry,
  emptyMessage = "No results.",
  emptyIcon: EmptyIcon = Inbox,
  skeletonRows = 8,
  selectable,
  selectedIds,
  onToggleRow,
  onToggleAll,
  onClearSelection,
  bulkActions,
  sort,
  onSortChange,
  onRowClick,
}: DataTableProps<T>) {
  const headerCbRef = useRef<HTMLInputElement>(null);

  const rows = data ?? [];
  const pageIds = rows.map(rowKey);
  const selectedCount = selectedIds?.size ?? 0;
  const allSelected = rows.length > 0 && pageIds.every((id) => selectedIds?.has(id));
  const someSelected = pageIds.some((id) => selectedIds?.has(id));

  useEffect(() => {
    if (headerCbRef.current) {
      headerCbRef.current.indeterminate = !allSelected && someSelected;
    }
  }, [allSelected, someSelected]);

  const toggleSort = (col: Column<T>) => {
    if (!col.sortable || !onSortChange) return;
    const key = col.sortKey ?? col.key;
    const dir: SortDir = sort?.key === key && sort.dir === "asc" ? "desc" : "asc";
    onSortChange({ key, dir });
  };

  const colSpan = columns.length + (selectable ? 1 : 0);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      {/* Sticky bulk-action bar */}
      {selectable && selectedCount > 0 && (
        <div className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-primary/10 px-4 py-2.5">
          <span className="text-sm font-medium">{selectedCount} selected</span>
          <div className="flex flex-wrap items-center gap-2">{bulkActions}</div>
          <button
            type="button"
            onClick={onClearSelection}
            className="ml-auto inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden /> Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input
                    ref={headerCbRef}
                    type="checkbox"
                    aria-label="Select all rows on this page"
                    checked={allSelected}
                    disabled={rows.length === 0}
                    onChange={(e) => onToggleAll?.(pageIds, e.target.checked)}
                    className="h-4 w-4 rounded border-border accent-primary"
                  />
                </th>
              )}
              {columns.map((col) => {
                const key = col.sortKey ?? col.key;
                const active = sort?.key === key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={
                      col.sortable
                        ? active
                          ? sort!.dir === "asc"
                            ? "ascending"
                            : "descending"
                          : "none"
                        : undefined
                    }
                    className={cn(
                      "whitespace-nowrap px-4 py-3 font-medium text-muted-foreground",
                      alignClass[col.align ?? "left"],
                      col.headerClassName,
                    )}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(col)}
                        className="inline-flex items-center gap-1 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {col.header}
                        {active ? (
                          sort!.dir === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" aria-hidden />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" aria-hidden />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 opacity-50" aria-hidden />
                        )}
                      </button>
                    ) : (
                      col.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: skeletonRows }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  {selectable && (
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-4" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <Skeleton className="h-4 w-full max-w-[10rem]" />
                    </td>
                  ))}
                </tr>
              ))
            ) : error ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center">
                  <p className="text-sm text-destructive">Failed to load data.</p>
                  {onRetry && (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-3 inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden /> Retry
                    </button>
                  )}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-16 text-center text-muted-foreground">
                  <EmptyIcon className="mx-auto mb-3 h-8 w-8 opacity-40" aria-hidden />
                  <div className="text-sm">{emptyMessage}</div>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const selected = selectedIds?.has(id) ?? false;
                return (
                  <tr
                    key={id}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      selected ? "bg-primary/5" : "hover:bg-muted/40",
                      onRowClick && "cursor-pointer",
                    )}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(row);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? "button" : undefined}
                  >
                    {selectable && (
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select row ${id}`}
                          checked={selected}
                          onChange={() => onToggleRow?.(id)}
                          className="h-4 w-4 rounded border-border accent-primary"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          "px-4 py-3",
                          alignClass[col.align ?? "left"],
                          col.className,
                        )}
                      >
                        {col.cell(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
