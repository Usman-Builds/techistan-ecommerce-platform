"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CornerDownRight,
  ExternalLink,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import type { NavItem, NavLocation } from "@/lib/api/storefront";
import {
  useCreateNavItem,
  useDeleteNavItem,
  useNavItems,
  useReorderNavItems,
  useUpdateNavItem,
} from "@/lib/api/hooks/storefront";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import { Select } from "@/components/ui/Select";
import { Field, Input, Toggle } from "@/components/ui/Form";
import { resolveIcon } from "@/lib/icons";
import { Glyph } from "@/components/ui/Glyph";
import { cn } from "@/lib/utils";

/** A nav entry's destination: a category, a manual URL, or nothing (a heading). */
type LinkKind = "category" | "url" | "heading";

function linkKindOf(item: NavItem): LinkKind {
  if (item.categoryId) return "category";
  if (item.href) return "url";
  return "heading";
}

/**
 * Header or footer navigation for one location.
 *
 * Both menus used to be derived from the category tree in JSX, which meant a
 * merchant could not add a "Gift cards" link, reorder the footer columns, or
 * keep one category out of the header without hiding it from the whole
 * storefront.
 *
 * Two levels, and what a parent MEANS differs by location — a dropdown trigger
 * in the header, a column heading in the footer — which is why the copy here is
 * location-aware rather than generically calling everything a "parent".
 */
export function NavigationManager({ location }: { location: NavLocation }) {
  const { data, isLoading } = useNavItems(location);
  const create = useCreateNavItem();
  const reorder = useReorderNavItems();
  const [openId, setOpenId] = useState<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  const roots = useMemo(
    () =>
      items
        .filter((i) => !i.parentId)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [items],
  );
  const childrenOf = useMemo(() => {
    const map = new Map<string, NavItem[]>();
    for (const item of items) {
      if (!item.parentId) continue;
      const bucket = map.get(item.parentId) ?? [];
      bucket.push(item);
      map.set(item.parentId, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.sortOrder - b.sortOrder);
    }
    return map;
  }, [items]);

  const parentNoun = location === "HEADER" ? "menu" : "column";

  const move = (siblings: NavItem[], index: number, direction: -1 | 1) => {
    const current = siblings[index];
    const target = siblings[index + direction];
    if (!current || !target) return;
    reorder.mutate([
      {
        id: current.id,
        parentId: current.parentId,
        sortOrder: target.sortOrder,
      },
      {
        id: target.id,
        parentId: target.parentId,
        sortOrder: current.sortOrder,
      },
    ]);
  };

  const addEntry = (parentId: string | null) =>
    create.mutate(
      {
        location,
        parentId,
        label: parentId ? "New link" : `New ${parentNoun}`,
        enabled: false,
      },
      { onSuccess: (item) => setOpenId(item.id) },
    );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {roots.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          Nothing here yet. The storefront falls back to building this menu from
          your categories.
        </p>
      ) : (
        <ul className="space-y-2">
          {roots.map((root, index) => (
            <li
              key={root.id}
              className="overflow-hidden rounded-lg border border-border bg-background"
            >
              <NavRow
                item={root}
                items={items}
                location={location}
                open={openId === root.id}
                onToggle={() => setOpenId(openId === root.id ? null : root.id)}
                onMoveUp={index > 0 ? () => move(roots, index, -1) : undefined}
                onMoveDown={
                  index < roots.length - 1
                    ? () => move(roots, index, 1)
                    : undefined
                }
              />

              {/* Children */}
              <ul className="border-t border-border bg-muted/20">
                {(childrenOf.get(root.id) ?? []).map((child, childIndex, siblings) => (
                  <li key={child.id} className="border-b border-border last:border-0">
                    <NavRow
                      item={child}
                      items={items}
                      location={location}
                      nested
                      open={openId === child.id}
                      onToggle={() =>
                        setOpenId(openId === child.id ? null : child.id)
                      }
                      onMoveUp={
                        childIndex > 0
                          ? () => move(siblings, childIndex, -1)
                          : undefined
                      }
                      onMoveDown={
                        childIndex < siblings.length - 1
                          ? () => move(siblings, childIndex, 1)
                          : undefined
                      }
                    />
                  </li>
                ))}
                <li className="p-2 pl-10">
                  <button
                    type="button"
                    onClick={() => addEntry(root.id)}
                    disabled={create.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden />
                    Add a link under &ldquo;{root.label}&rdquo;
                  </button>
                </li>
              </ul>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => addEntry(null)}
        disabled={create.isPending}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
      >
        {create.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : (
          <Plus className="h-4 w-4" aria-hidden />
        )}
        Add a top-level {parentNoun}
      </button>
    </div>
  );
}

function NavRow({
  item,
  items,
  location,
  nested,
  open,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  item: NavItem;
  items: NavItem[];
  location: NavLocation;
  nested?: boolean;
  open: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const update = useUpdateNavItem();
  const remove = useDeleteNavItem();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [draft, setDraft] = useState({
    label: item.label,
    kind: linkKindOf(item),
    href: item.href ?? "",
    categoryId: item.categoryId,
    icon: item.icon,
    badge: item.badge ?? "",
    newTab: item.newTab,
    parentId: item.parentId,
  });

  const icon = resolveIcon(item.icon);
  const childCount = items.filter((i) => i.parentId === item.id).length;

  // A category link whose category has been hidden is dead: the storefront
  // drops it, so flag it here rather than letting the admin wonder.
  const brokenCategory =
    item.categoryId != null && item.category?.isActive === false;

  const destination = item.category
    ? `/c/${item.category.slug}`
    : (item.href ?? null);

  const save = () =>
    update.mutate({
      id: item.id,
      input: {
        label: draft.label.trim() || "Untitled",
        // The three destination kinds are mutually exclusive, so switching
        // between them CLEARS the other field — otherwise a leftover href would
        // quietly win the next time someone changed the kind.
        href: draft.kind === "url" ? draft.href.trim() || null : null,
        categoryId: draft.kind === "category" ? draft.categoryId : null,
        icon: draft.icon,
        badge: draft.badge.trim() || null,
        newTab: draft.newTab,
        parentId: draft.parentId,
      },
    });

  const parentOptions = items.filter(
    (i) => !i.parentId && i.id !== item.id && i.location === location,
  );

  return (
    <>
      <div className={cn("flex items-center gap-3 p-3", nested && "pl-8")}>
        {nested ? (
          <CornerDownRight
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        ) : (
          <GripVertical
            className="h-4 w-4 shrink-0 text-muted-foreground"
            aria-hidden
          />
        )}

        <Glyph icon={icon} className="h-4 w-4 shrink-0 text-muted-foreground" />

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{item.label}</span>
            {item.badge && (
              <span className="rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">
                {item.badge}
              </span>
            )}
            {brokenCategory && (
              <span
                title="This category is hidden, so the link will not appear"
                className="text-warning"
              >
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
              </span>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {destination ??
              (childCount > 0
                ? `${location === "HEADER" ? "Dropdown" : "Column"} · ${childCount} link${childCount === 1 ? "" : "s"}`
                : "No destination")}
            {item.newTab && " · opens in a new tab"}
          </span>
        </button>

        <Toggle
          srLabel={`Show "${item.label}" in the menu`}
          checked={item.enabled}
          revertOn={update.isError}
          onChange={(enabled) =>
            update.mutate({ id: item.id, input: { enabled } })
          }
        />

        <IconBtn label="Move up" onClick={onMoveUp} disabled={!onMoveUp}>
          <ChevronUp className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Move down" onClick={onMoveDown} disabled={!onMoveDown}>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Delete" danger onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconBtn>
      </div>

      {open && (
        <div
          className={cn(
            "space-y-4 border-t border-border bg-card p-4",
            nested && "pl-8",
          )}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" required>
              <Input
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
              />
            </Field>

            <Field label="Links to">
              <Select<LinkKind>
                label="Destination type"
                value={draft.kind}
                onChange={(kind) => setDraft({ ...draft, kind })}
                options={[
                  {
                    value: "category",
                    label: "A category",
                    description: "URL follows the category if it is renamed",
                  },
                  {
                    value: "url",
                    label: "A custom URL",
                    description: "Any storefront path or external link",
                  },
                  {
                    value: "heading",
                    label:
                      location === "HEADER"
                        ? "Nothing (dropdown only)"
                        : "Nothing (column heading)",
                    description: "Not clickable — it just groups its children",
                  },
                ]}
              />
            </Field>

            {draft.kind === "category" && (
              <Field
                label="Category"
                className="sm:col-span-2"
                hint="The link follows this category's slug, so renaming it never breaks the menu."
              >
                <CategoryPicker
                  label="Linked category"
                  value={draft.categoryId}
                  onChange={(categoryId) => setDraft({ ...draft, categoryId })}
                  allowNone={false}
                  placeholder="Choose a category…"
                />
              </Field>
            )}

            {draft.kind === "url" && (
              <Field
                label="URL"
                className="sm:col-span-2"
                hint="A storefront path like /deals, or a full https:// address."
              >
                <Input
                  value={draft.href}
                  onChange={(e) => setDraft({ ...draft, href: e.target.value })}
                  placeholder="/deals"
                />
              </Field>
            )}

            <Field label="Icon">
              <IconPicker
                label="Link icon"
                value={draft.icon}
                onChange={(icon) => setDraft({ ...draft, icon })}
              />
            </Field>

            <Field label="Badge" hint='A short pill, e.g. "New" or "Sale".'>
              <Input
                value={draft.badge}
                onChange={(e) => setDraft({ ...draft, badge: e.target.value })}
                maxLength={20}
                placeholder="None"
              />
            </Field>

            {parentOptions.length > 0 && (
              <Field
                label={location === "HEADER" ? "Inside menu" : "In column"}
                hint="Move this entry under a different heading."
              >
                <Select
                  label="Parent entry"
                  value={draft.parentId ?? ""}
                  onChange={(parentId) =>
                    setDraft({ ...draft, parentId: parentId || null })
                  }
                  options={[
                    { value: "", label: "Top level" },
                    ...parentOptions.map((p) => ({
                      value: p.id,
                      label: p.label,
                    })),
                  ]}
                />
              </Field>
            )}

            <Toggle
              label="Open in a new tab"
              checked={draft.newTab}
              onChange={(newTab) => setDraft({ ...draft, newTab })}
              className="sm:col-span-2"
            />
          </div>

          {draft.kind === "url" && draft.href.startsWith("http") && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
              External link — consider turning on &ldquo;open in a new
              tab&rdquo;.
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              Close
            </button>
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Save
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${item.label}"?`}
        description={
          childCount > 0
            ? `The ${childCount} link${childCount === 1 ? "" : "s"} underneath it are deleted too. This cannot be undone.`
            : "This cannot be undone."
        }
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync(item.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
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
  onClick?: () => void;
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
      className={cn(
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
