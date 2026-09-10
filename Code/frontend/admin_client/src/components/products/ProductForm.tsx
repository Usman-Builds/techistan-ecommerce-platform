"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Save } from "lucide-react";
import {
  productFormSchema,
  type ProductFormValues,
} from "@/lib/validation/product";
import type {
  ProductDetail,
  ProductInput,
  ProductStatus,
} from "@/lib/api/products";
import {
  useCreateProduct,
  useSetProductImages,
  useUpdateProduct,
} from "@/lib/api/hooks/products";
import { ApiError } from "@/lib/api/client";
import { slugify } from "@/lib/slug";
import {
  MediaUploader,
  type MediaItem,
} from "@/components/shared/MediaUploader";
import { Select } from "@/components/ui/Select";
import { CategorySelect } from "./CategorySelect";
import { TagSelector } from "./TagSelector";
import {
  VariantBuilder,
  type VariantBuilderResult,
} from "./VariantBuilder";

type Props =
  | { mode: "create"; product?: undefined }
  | { mode: "edit"; product: ProductDetail };

const labelCls = "mb-1 block text-sm font-medium";
const inputCls =
  "w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const errorCls = "mt-1 text-xs text-destructive";

export function ProductForm({ mode, product }: Props) {
  const router = useRouter();
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(product?.id ?? "");
  const setImages = useSetProductImages(product?.id ?? "");

  const [tagIds, setTagIds] = useState<string[]>(
    product?.tags.map((t) => t.id) ?? [],
  );
  const [variantResult, setVariantResult] = useState<VariantBuilderResult>({
    axes: product ? [] : [],
    variants: [],
    valid: true,
  });
  const [images, setImages_] = useState<MediaItem[]>(
    product?.images.map((img, i) => ({
      cloudinaryPublicId: img.cloudinaryPublicId,
      url: img.url,
      alt: img.alt ?? "",
      width: img.width ?? undefined,
      height: img.height ?? undefined,
      position: img.position ?? i,
    })) ?? [],
  );
  const [formError, setFormError] = useState<string | null>(null);

  const onVariantChange = useCallback(
    (r: VariantBuilderResult) => setVariantResult(r),
    [],
  );
  const onImagesChange = useCallback((items: MediaItem[]) => {
    setImages_(items);
  }, []);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      title: product?.title ?? "",
      slug: product?.slug ?? "",
      description: product?.description ?? "",
      status: product?.status ?? "DRAFT",
      categoryId: product?.categoryId ?? null,
      metaTitle: product?.metaTitle ?? "",
      metaDescription: product?.metaDescription ?? "",
      ogImage: product?.ogImage ?? "",
      canonicalUrl: product?.canonicalUrl ?? "",
    },
  });

  const categoryId = watch("categoryId");
  const title = watch("title");
  // Watched (not just registered) because the themed Select is a controlled
  // component — react-hook-form's register() only works on native inputs.
  const status = watch("status");
  const slugTouched = useRef(mode === "edit");

  const submitting =
    createProduct.isPending || updateProduct.isPending || setImages.isPending;

  const toImageInputs = () =>
    images.map((img, i) => ({
      publicId: img.cloudinaryPublicId,
      url: img.url,
      alt: img.alt || undefined,
      position: i,
      width: img.width,
      height: img.height,
    }));

  const onSubmit = async (values: ProductFormValues) => {
    setFormError(null);
    if (!variantResult.valid) {
      setFormError("Fix the variant matrix before saving (see below).");
      return;
    }

    const payload: ProductInput = {
      title: values.title,
      slug: values.slug || undefined,
      description: values.description || undefined,
      status: values.status,
      categoryId: values.categoryId ?? null,
      tagIds,
      axes: variantResult.axes,
      variants: variantResult.variants,
      metaTitle: values.metaTitle || undefined,
      metaDescription: values.metaDescription || undefined,
      ogImage: values.ogImage || undefined,
      canonicalUrl: values.canonicalUrl || undefined,
    };

    try {
      if (mode === "create") {
        const created = await createProduct.mutateAsync(payload);
        if (images.length > 0) {
          await setImagesFor(created.id, toImageInputs());
        }
        router.push(`/products/${created.id}`);
        router.refresh();
      } else {
        await updateProduct.mutateAsync(payload);
        await setImages.mutateAsync(toImageInputs());
        router.refresh();
      }
    } catch (err) {
      setFormError(
        err instanceof ApiError ? err.message : "Something went wrong saving.",
      );
    }
  };

  // Create mode needs the freshly-returned id, so call the raw API for images.
  const setImagesFor = async (
    id: string,
    imgs: ReturnType<typeof toImageInputs>,
  ) => {
    const { setProductImages } = await import("@/lib/api/products");
    await setProductImages(id, imgs);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
      {formError && (
        <div
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {formError}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Section title="Details">
            <div>
              <label htmlFor="title" className={labelCls}>
                Title
              </label>
              <input
                id="title"
                {...register("title", {
                  onChange: (e) => {
                    if (!slugTouched.current) {
                      setValue("slug", slugify(e.target.value), {
                        shouldValidate: true,
                      });
                    }
                  },
                })}
                className={inputCls}
                aria-invalid={!!errors.title}
              />
              {errors.title && (
                <p className={errorCls}>{errors.title.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="slug" className={labelCls}>
                Slug
              </label>
              <input
                id="slug"
                {...register("slug", {
                  onChange: () => (slugTouched.current = true),
                })}
                placeholder={title ? slugify(title) : "auto-from-title"}
                className={inputCls}
                aria-invalid={!!errors.slug}
              />
              {errors.slug ? (
                <p className={errorCls}>{errors.slug.message}</p>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">
                  Leave blank to derive from the title. Must be unique.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="description" className={labelCls}>
                Description
              </label>
              <textarea
                id="description"
                rows={6}
                {...register("description")}
                className={inputCls}
                placeholder="Markdown supported"
              />
            </div>
          </Section>

          <Section title="Variants">
            <VariantBuilder
              initialVariants={product?.variants}
              onChange={onVariantChange}
            />
          </Section>

          <Section title="Images">
            <MediaUploader
              folder="techistan/products"
              persist={false}
              initialItems={images}
              onChange={onImagesChange}
            />
          </Section>

          <Section title="SEO">
            <div>
              <label htmlFor="metaTitle" className={labelCls}>
                Meta title
              </label>
              <input id="metaTitle" {...register("metaTitle")} className={inputCls} />
              {errors.metaTitle && (
                <p className={errorCls}>{errors.metaTitle.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="metaDescription" className={labelCls}>
                Meta description
              </label>
              <textarea
                id="metaDescription"
                rows={3}
                {...register("metaDescription")}
                className={inputCls}
              />
              {errors.metaDescription && (
                <p className={errorCls}>{errors.metaDescription.message}</p>
              )}
            </div>
            <div>
              <label htmlFor="ogImage" className={labelCls}>
                OG image URL
              </label>
              <input id="ogImage" {...register("ogImage")} className={inputCls} />
            </div>
            <div>
              <label htmlFor="canonicalUrl" className={labelCls}>
                Canonical URL
              </label>
              <input
                id="canonicalUrl"
                {...register("canonicalUrl")}
                className={inputCls}
                placeholder="https://…"
              />
              {errors.canonicalUrl && (
                <p className={errorCls}>{errors.canonicalUrl.message}</p>
              )}
            </div>
          </Section>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <Section title="Status">
            <Select<ProductStatus>
              label="Status"
              value={status ?? "DRAFT"}
              onChange={(value) =>
                setValue("status", value, { shouldDirty: true })
              }
              options={[
                {
                  value: "DRAFT",
                  label: "Draft",
                  description: "Not visible to shoppers",
                },
                {
                  value: "ACTIVE",
                  label: "Active",
                  description: "Published on the storefront",
                },
                {
                  value: "ARCHIVED",
                  label: "Archived",
                  description: "Hidden, kept for records",
                },
              ]}
            />
          </Section>

          <Section title="Category">
            <CategorySelect
              value={categoryId}
              onChange={(id) =>
                setValue("categoryId", id, { shouldDirty: true })
              }
            />
          </Section>

          <Section title="Tags">
            <TagSelector value={tagIds} onChange={setTagIds} />
          </Section>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={() => router.push("/products")}
          className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90 disabled:opacity-60"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Save className="h-4 w-4" aria-hidden />
          )}
          {mode === "create" ? "Create product" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
