"use client";

import { useMemo } from "react";
import { useAdminCategoryTree } from "@/lib/api/hooks/categories";
import type { CategoryTreeNode } from "@/lib/api/categories";
import { categoryIcon } from "@/lib/icons";
import { Select, type SelectOption } from "./Select";
import { MultiSelect } from "./MultiSelect";

/**
 * Flatten the category tree into picker rows.
 *
 * The old picker rendered hierarchy as literal text — `"— — Laptops"` — inside
 * a native `<select>`. That is unreadable at three levels, sorts and searches
 * badly, and a screen reader announces the dashes as content. Here the depth
 * travels as DATA (`depth`), so the list can draw a real indent rail, and the
 * ancestry travels as a `description` ("Computers › Laptops"), which is what
 * actually disambiguates two categories that share a name.
 *
 * The right-hand hint is the SUBTREE product count, not the direct one:
 * "Computers · 0" is misleading when all seven products sit in its children.
 */
function flatten(
  nodes: CategoryTreeNode[],
  depth = 0,
  trail: string[] = [],
): SelectOption[] {
  return nodes.flatMap((node) => {
    const path = [...trail, node.name];
    const Icon = categoryIcon(node.slug, node.name, node.iconKey);
    const row: SelectOption = {
      value: node.id,
      label: node.name,
      description: trail.length > 0 ? trail.join(" › ") : undefined,
      hint:
        node.totalProductCount > 0 ? String(node.totalProductCount) : undefined,
      icon: <Icon className="h-4 w-4" aria-hidden />,
      depth,
    };
    return [row, ...flatten(node.children, depth + 1, path)];
  });
}

/**
 * Single-category picker.
 *
 * `excludeId` removes a category and its whole subtree — used when choosing a
 * PARENT, where offering the category itself or one of its descendants would
 * let the admin build a cycle the API is only going to reject.
 */
export function CategoryPicker({
  value,
  onChange,
  id,
  label = "Category",
  placeholder = "No category",
  excludeId,
  allowNone = true,
  noneLabel = "No category",
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (categoryId: string | null) => void;
  id?: string;
  label?: string;
  placeholder?: string;
  excludeId?: string;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
  disabled?: boolean;
}) {
  const { data: tree, isLoading } = useAdminCategoryTree();

  const options = useMemo(() => {
    const pruned = excludeId ? prune(tree ?? [], excludeId) : (tree ?? []);
    const rows = flatten(pruned);
    return allowNone
      ? [{ value: "", label: noneLabel } satisfies SelectOption, ...rows]
      : rows;
  }, [tree, excludeId, allowNone, noneLabel]);

  return (
    <Select
      id={id}
      label={label}
      className={className}
      disabled={disabled || isLoading}
      value={value ?? ""}
      onChange={(next) => onChange(next || null)}
      options={options}
      placeholder={isLoading ? "Loading…" : placeholder}
      // Past a dozen or so categories, scanning beats scrolling.
      searchable={options.length > 8}
      searchPlaceholder="Search categories…"
      emptyMessage="No categories match."
    />
  );
}

/** Multi-category picker, for promotion scoping. */
export function CategoryMultiPicker({
  values,
  onChange,
  id,
  label = "Categories",
  placeholder = "Choose categories…",
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
  const { data: tree, isLoading } = useAdminCategoryTree();
  const options = useMemo(() => flatten(tree ?? []), [tree]);

  return (
    <MultiSelect
      id={id}
      label={label}
      className={className}
      disabled={disabled || isLoading}
      values={values}
      onChange={onChange}
      options={options}
      placeholder={isLoading ? "Loading…" : placeholder}
      searchPlaceholder="Search categories…"
      emptyMessage="No categories match."
      max={max}
    />
  );
}

/** Drop `id` and everything under it from the tree. */
function prune(nodes: CategoryTreeNode[], id: string): CategoryTreeNode[] {
  return nodes
    .filter((n) => n.id !== id)
    .map((n) => ({ ...n, children: prune(n.children, id) }));
}
