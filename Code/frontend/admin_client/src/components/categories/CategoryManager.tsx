"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ChevronDown,
  ChevronUp,
  EyeOff,
  GripVertical,
  Loader2,
  Pencil,
  Star,
  Trash2,
} from "lucide-react";
import {
  useAdminCategories,
  useDeleteCategory,
  useReorderCategories,
} from "@/lib/api/hooks/categories";
import type { AdminCategory } from "@/lib/api/categories";
import { ApiError } from "@/lib/api/client";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { categoryIcon } from "@/lib/icons";
import { Glyph } from "@/components/ui/Glyph";
import { cn } from "@/lib/utils";

type TreeItem = AdminCategory & { depth: number };

/** Flatten the category list into a depth-annotated, sorted, pre-order sequence. */
function toTree(categories: AdminCategory[]): TreeItem[] {
  const byParent = new Map<string | null, AdminCategory[]>();
  for (const c of categories) {
    const bucket = byParent.get(c.parentId) ?? [];
    bucket.push(c);
    byParent.set(c.parentId, bucket);
  }
  for (const bucket of byParent.values()) {
    bucket.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }
  const out: TreeItem[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of byParent.get(parentId) ?? []) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

/**
 * The category TREE: structure, order and visibility at a glance.
 *
 * Editing a category's content now lives on its own page, which is what let
 * this screen stop being a row of cramped inline controls. Three things changed
 * as a result:
 *
 *   * every row shows what a shopper would see — the artwork, the icon, and
 *     badges for hidden / not-in-nav / featured — so "why isn't this showing
 *     up?" is answerable without opening anything;
 *   * re-parenting uses the themed category picker instead of a native select
 *     rendering `— — Laptops`;
 *   * deleting a non-empty category asks for the replacement with that same
 *     picker, instead of a `window.prompt` demanding a raw database id, which
 *     is what it used to do.
 */
export function CategoryManager() {
  const { data, isLoading } = useAdminCategories();
  const deleteCategory = useDeleteCategory();
  const reorder = useReorderCategories();

  const categories = useMemo(() => data ?? [], [data]);
  const tree = useMemo(() => toTree(categories), [categories]);

  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TreeItem | null>(null);
  const [reassignTo, setReassignTo] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);

  const runOrShowError = async (fn: () => Promise<unknown>) => {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Action failed.");
    }
  };

  const reparent = (id: string, parentId: string | null) =>
    runOrShowError(() => reorder.mutateAsync([{ id, parentId, sortOrder: 0 }]));

  // Reorder within the same parent (sibling list) — used by up/down + drag.
  const move = (item: TreeItem, direction: -1 | 1) =>
    runOrShowError(async () => {
      const siblings = tree.filter((t) => t.parentId === item.parentId);
      const idx = siblings.findIndex((s) => s.id === item.id);
      const swapWith = siblings[idx + direction];
      if (!swapWith) return;
      await reorder.mutateAsync([
        { id: item.id, parentId: item.parentId, sortOrder: swapWith.sortOrder },
        {
          id: swapWith.id,
          parentId: swapWith.parentId,
          sortOrder: item.sortOrder,
        },
      ]);
    });

  const onDropOn = (target: TreeItem) =>
    runOrShowError(async () => {
      const sourceId = dragId.current;
      dragId.current = null;
      if (!sourceId || sourceId === target.id) return;
      const source = tree.find((t) => t.id === sourceId);
      if (!source || source.parentId !== target.parentId) return; // same-parent only
      const siblings = tree.filter((t) => t.parentId === target.parentId);
      const reordered = siblings.filter((s) => s.id !== sourceId);
      const targetIdx = reordered.findIndex((s) => s.id === target.id);
      reordered.splice(targetIdx, 0, source);
      await reorder.mutateAsync(
        reordered.map((s, i) => ({
          id: s.id,
          parentId: s.parentId,
          sortOrder: i,
        })),
      );
    });

  const hasDependents = (item: TreeItem) =>
    item._count.children > 0 || item._count.products > 0;

  const confirmDelete = () =>
    runOrShowError(async () => {
      if (!deleteTarget) return;
      await deleteCategory.mutateAsync({
        id: deleteTarget.id,
        reassignTo: reassignTo ?? undefined,
      });
      setDeleteTarget(null);
      setReassignTo(null);
    });

  return (
    <div className="space-y-4">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        {isLoading ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
          </div>
        ) : tree.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">
            No categories yet. Create your first one to start organizing the
            catalog.
          </p>
        ) : (
          <ul>
            {tree.map((item) => {
              const icon = categoryIcon(item.slug, item.name, item.iconKey);
              return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => (dragId.current = item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => onDropOn(item)}
                  className={cn(
                    "flex items-center gap-3 border-b border-border px-3 py-2.5 last:border-0 hover:bg-muted/30",
                    !item.isActive && "opacity-60",
                  )}
                  style={{ paddingLeft: `${item.depth * 1.5 + 0.75}rem` }}
                >
                  <GripVertical
                    className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground"
                    aria-hidden
                  />

                  {/* Artwork, or the icon on a neutral tile when there is none.
                   * Seeing which categories still have no poster is half the
                   * value of this list. */}
                  {item.imageUrl ? (
                    <span className="relative block h-9 w-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                      <Image
                        src={item.imageUrl}
                        alt=""
                        fill
                        sizes="36px"
                        className="object-cover"
                      />
                    </span>
                  ) : (
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
                      <Glyph icon={icon} className="h-4 w-4" />
                    </span>
                  )}

                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/categories/${item.id}`}
                      className="block truncate text-sm font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    <p className="truncate text-xs text-muted-foreground">
                      /c/{item.slug} · {item._count.products} product
                      {item._count.products === 1 ? "" : "s"}
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                    {!item.isActive && (
                      <Badge icon={EyeOff} tone="danger">
                        Hidden
                      </Badge>
                    )}
                    {item.isActive && !item.showInNav && (
                      <Badge tone="neutral">Not in nav</Badge>
                    )}
                    {item.featured && (
                      <Badge icon={Star} tone="primary">
                        Featured
                      </Badge>
                    )}
                  </div>

                  <div className="w-40 shrink-0">
                    <CategoryPicker
                      label={`Parent of ${item.name}`}
                      value={item.parentId}
                      onChange={(parentId) => reparent(item.id, parentId)}
                      excludeId={item.id}
                      noneLabel="Top level"
                      placeholder="Top level"
                    />
                  </div>

                  <IconButton label="Move up" onClick={() => move(item, -1)}>
                    <ChevronUp className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <IconButton label="Move down" onClick={() => move(item, 1)}>
                    <ChevronDown className="h-4 w-4" aria-hidden />
                  </IconButton>
                  <Link
                    href={`/categories/${item.id}`}
                    aria-label={`Edit ${item.name}`}
                    title="Edit"
                    className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Link>
                  <IconButton
                    label="Delete"
                    danger
                    onClick={() => {
                      setDeleteTarget(item);
                      setReassignTo(null);
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </IconButton>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Drag a row onto a sibling to reorder it, or use the arrows. Move a
        category between parents with the dropdown. Maximum depth is 3 levels.
      </p>

      <ConfirmDialog
        open={deleteTarget !== null}
        title={deleteTarget ? `Delete "${deleteTarget.name}"?` : ""}
        tone="danger"
        confirmLabel="Delete category"
        loading={deleteCategory.isPending}
        description={
          deleteTarget ? (
            hasDependents(deleteTarget) ? (
              <div className="space-y-3">
                <p>
                  This category holds{" "}
                  <strong>{deleteTarget._count.products}</strong> product
                  {deleteTarget._count.products === 1 ? "" : "s"} and{" "}
                  <strong>{deleteTarget._count.children}</strong> sub-categor
                  {deleteTarget._count.children === 1 ? "y" : "ies"}. Choose
                  where they should go — nothing is deleted along with it.
                </p>
                <CategoryPicker
                  label="Move contents to"
                  value={reassignTo}
                  onChange={setReassignTo}
                  excludeId={deleteTarget.id}
                  allowNone={false}
                  placeholder="Choose a category…"
                />
              </div>
            ) : (
              <p>
                This category is empty, so nothing else is affected. This cannot
                be undone.
              </p>
            )
          ) : (
            ""
          )
        }
        onConfirm={() => {
          // The API rejects a non-empty delete without a target anyway; blocking
          // here turns that into an obvious disabled state instead of an error.
          if (deleteTarget && hasDependents(deleteTarget) && !reassignTo) return;
          void confirmDelete();
        }}
        onCancel={() => {
          setDeleteTarget(null);
          setReassignTo(null);
        }}
      />
    </div>
  );
}

function Badge({
  children,
  icon: Icon,
  tone,
}: {
  children: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone: "neutral" | "danger" | "primary";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        tone === "danger" && "bg-destructive/15 text-destructive",
        tone === "primary" && "bg-primary/15 text-primary",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

function IconButton({
  label,
  children,
  onClick,
  danger,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
