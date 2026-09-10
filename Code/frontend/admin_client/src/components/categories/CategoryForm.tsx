"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, Save, Star } from "lucide-react";
import {
  useCreateCategory,
  useUpdateCategory,
} from "@/lib/api/hooks/categories";
import type { AdminCategoryDetail, CategoryInput } from "@/lib/api/categories";
import { ApiError } from "@/lib/api/client";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import { ImageField } from "@/components/ui/ImageField";
import { Field, Input, Panel, Textarea, Toggle } from "@/components/ui/Form";
import { Glyph } from "@/components/ui/Glyph";
import { categoryIcon, guessIconKey } from "@/lib/icons";
import { slugify } from "@/lib/slug";

const CATEGORY_FOLDER = "techistan/categories";

/** Everything the editor holds, as plain form state. */
interface FormState {
  name: string;
  slug: string;
  parentId: string | null;
  description: string;
  iconKey: string | null;
  imageId: string | null;
  imageUrl: string | null;
  bannerId: string | null;
  bannerUrl: string | null;
  metaTitle: string;
  metaDescription: string;
  isActive: boolean;
  showInNav: boolean;
  featured: boolean;
  sortOrder: string;
}

function initialState(category?: AdminCategoryDetail): FormState {
  return {
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    parentId: category?.parentId ?? null,
    description: category?.description ?? "",
    iconKey: category?.iconKey ?? null,
    imageId: category?.imageId ?? null,
    imageUrl: category?.imageUrl ?? null,
    bannerId: category?.bannerId ?? null,
    bannerUrl: category?.bannerUrl ?? null,
    metaTitle: category?.metaTitle ?? "",
    metaDescription: category?.metaDescription ?? "",
    isActive: category?.isActive ?? true,
    showInNav: category?.showInNav ?? true,
    featured: category?.featured ?? false,
    sortOrder: String(category?.sortOrder ?? 0),
  };
}

/**
 * Full category editor.
 *
 * A category used to be a NAME IN A TREE — the only things editable were its
 * label and its parent, so the storefront had to invent everything else: it
 * guessed an icon from the slug, had no cover art, no copy above the grid, and
 * no way to hide a category without deleting it. That is what this screen
 * fixes; the tree manager stays for structure and ordering.
 *
 * The four groups map to four decisions: what it IS (name/slug/parent), how it
 * LOOKS (description/icon/artwork), how it is FOUND (SEO), and whether it is
 * VISIBLE at all.
 */
export function CategoryForm({
  mode,
  category,
}: {
  mode: "create" | "edit";
  category?: AdminCategoryDetail;
}) {
  const router = useRouter();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [state, setState] = useState<FormState>(() => initialState(category));
  const [error, setError] = useState<string | null>(null);
  const [slugTouched, setSlugTouched] = useState(mode === "edit");

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const pending = create.isPending || update.isPending;
  const effectiveSlug = state.slug || slugify(state.name);
  const suggestion = useMemo(
    () => guessIconKey(effectiveSlug, state.name),
    [effectiveSlug, state.name],
  );
  const previewIcon = categoryIcon(effectiveSlug, state.name, state.iconKey);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = state.name.trim();
    if (!name) {
      setError("Give the category a name.");
      return;
    }

    const sortOrder = parseInt(state.sortOrder, 10);
    const input: CategoryInput = {
      name,
      slug: state.slug.trim() || undefined,
      parentId: state.parentId,
      description: state.description.trim() || null,
      iconKey: state.iconKey,
      imageId: state.imageId,
      imageUrl: state.imageUrl,
      bannerId: state.bannerId,
      bannerUrl: state.bannerUrl,
      metaTitle: state.metaTitle.trim() || null,
      metaDescription: state.metaDescription.trim() || null,
      isActive: state.isActive,
      showInNav: state.showInNav,
      featured: state.featured,
      sortOrder: Number.isFinite(sortOrder) && sortOrder >= 0 ? sortOrder : 0,
    };

    try {
      if (mode === "create") {
        const created = await create.mutateAsync(input);
        router.push(`/categories/${created.id}`);
      } else if (category) {
        await update.mutateAsync({ id: category.id, input });
        router.push("/categories");
      }
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not save the category.",
      );
    }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      {error && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-5">
          <Panel title="Basics">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" htmlFor="cat-name" required>
                <Input
                  id="cat-name"
                  value={state.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setState((prev) => ({
                      ...prev,
                      name,
                      // The slug tracks the name until the admin edits it by
                      // hand, at which point it is theirs and we stop touching
                      // it — silently rewriting a chosen URL breaks links.
                      slug: slugTouched ? prev.slug : slugify(name),
                    }));
                  }}
                  placeholder="Laptops"
                  autoFocus={mode === "create"}
                />
              </Field>

              <Field
                label="URL slug"
                htmlFor="cat-slug"
                hint={`Storefront: /c/${effectiveSlug || "…"}`}
              >
                <Input
                  id="cat-slug"
                  value={state.slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    set("slug", e.target.value);
                  }}
                  placeholder="laptops"
                />
              </Field>

              <Field
                label="Parent category"
                hint="Up to three levels deep."
                className="sm:col-span-2"
              >
                <CategoryPicker
                  label="Parent category"
                  value={state.parentId}
                  onChange={(id) => set("parentId", id)}
                  // A category can't be filed under itself or its own child.
                  excludeId={category?.id}
                  noneLabel="Top level (no parent)"
                  placeholder="Top level (no parent)"
                />
              </Field>

              <Field
                label="Description"
                htmlFor="cat-description"
                hint="Shown above the product grid on the category page."
                className="sm:col-span-2"
              >
                <Textarea
                  id="cat-description"
                  rows={3}
                  value={state.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="Ultrabooks, workstations and gaming laptops, from entry level to flagship."
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Artwork"
            description="Two crops, because the storefront uses two shapes."
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <Field
                label="Poster image"
                hint="Category tiles, rail cards and the mega-menu."
              >
                <ImageField
                  publicId={state.imageId}
                  url={state.imageUrl}
                  folder={CATEGORY_FOLDER}
                  aspect="portrait"
                  alt={state.name}
                  onChange={({ publicId, url }) =>
                    setState((prev) => ({
                      ...prev,
                      imageId: publicId,
                      imageUrl: url,
                    }))
                  }
                />
              </Field>

              <Field
                label="Cover banner"
                hint="The wide header on the category page itself."
              >
                <ImageField
                  publicId={state.bannerId}
                  url={state.bannerUrl}
                  folder={CATEGORY_FOLDER}
                  aspect="banner"
                  alt={state.name}
                  onChange={({ publicId, url }) =>
                    setState((prev) => ({
                      ...prev,
                      bannerId: publicId,
                      bannerUrl: url,
                    }))
                  }
                />
              </Field>
            </div>
          </Panel>

          <Panel
            title="Search engines"
            description="Leave blank to fall back to the category name and description."
          >
            <div className="grid gap-4">
              <Field
                label="Meta title"
                htmlFor="cat-meta-title"
                hint={`${state.metaTitle.length}/60 characters is the usual display limit.`}
              >
                <Input
                  id="cat-meta-title"
                  value={state.metaTitle}
                  onChange={(e) => set("metaTitle", e.target.value)}
                  placeholder={state.name || "Laptops"}
                  maxLength={160}
                />
              </Field>
              <Field
                label="Meta description"
                htmlFor="cat-meta-description"
                hint={`${state.metaDescription.length}/160 characters is the usual display limit.`}
              >
                <Textarea
                  id="cat-meta-description"
                  rows={2}
                  value={state.metaDescription}
                  onChange={(e) => set("metaDescription", e.target.value)}
                  maxLength={320}
                />
              </Field>
            </div>
          </Panel>
        </div>

        <aside className="space-y-5">
          <Panel title="Visibility">
            <div className="space-y-4">
              <Toggle
                label="Visible on the storefront"
                description="Hidden categories 404 and disappear from every feed."
                checked={state.isActive}
                onChange={(v) => set("isActive", v)}
              />
              <Toggle
                label="Show in navigation"
                description="Header and footer menus. Still browsable when off."
                checked={state.showInNav}
                onChange={(v) => set("showInNav", v)}
                disabled={!state.isActive}
              />
              <Toggle
                label="Featured"
                description="Eligible for the homepage featured-categories rail."
                checked={state.featured}
                onChange={(v) => set("featured", v)}
                disabled={!state.isActive}
              />
            </div>
          </Panel>

          <Panel title="Appearance">
            <div className="space-y-4">
              <Field
                label="Icon"
                hint="Automatic picks one from the name. Override it here."
              >
                <IconPicker
                  label="Category icon"
                  value={state.iconKey}
                  suggestion={suggestion}
                  onChange={(key) => set("iconKey", key)}
                />
              </Field>

              <Field
                label="Sort order"
                htmlFor="cat-sort"
                hint="Lower numbers come first among siblings."
              >
                <Input
                  id="cat-sort"
                  type="number"
                  min={0}
                  value={state.sortOrder}
                  onChange={(e) => set("sortOrder", e.target.value)}
                />
              </Field>

              {/* A tiny live preview of the chrome an admin is choosing. It
               * costs nothing and answers "what will this actually look like"
               * without a round trip to the storefront. */}
              <div className="rounded-lg border border-border bg-background p-3">
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  Preview
                </p>
                <div className="flex items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Glyph icon={previewIcon} className="h-4.5 w-4.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {state.name || "Category name"}
                    </span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      {state.isActive ? (
                        <Eye className="h-3 w-3" aria-hidden />
                      ) : (
                        <EyeOff className="h-3 w-3" aria-hidden />
                      )}
                      {state.isActive ? "Visible" : "Hidden"}
                      {state.featured && (
                        <>
                          <Star className="h-3 w-3" aria-hidden />
                          Featured
                        </>
                      )}
                    </span>
                  </span>
                </div>
              </div>
            </div>
          </Panel>

          {category && (
            <Panel title="Contents">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Products</dt>
                  <dd className="font-medium tabular-nums">
                    {category._count.products}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Sub-categories</dt>
                  <dd className="font-medium tabular-nums">
                    {category._count.children}
                  </dd>
                </div>
              </dl>
              {category._count.products > 0 && (
                <Link
                  href={`/products?categoryId=${category.id}`}
                  className="mt-3 inline-block text-sm font-medium text-primary hover:underline"
                >
                  View these products
                </Link>
              )}
            </Panel>
          )}
        </aside>
      </div>

      <div className="sticky bottom-0 flex items-center justify-end gap-2 border-t border-border bg-background/95 py-3 backdrop-blur">
        <Link
          href="/categories"
          className="rounded-md border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {mode === "create" ? "Create category" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
