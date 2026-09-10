"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Loader2,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import {
  BadgePercent,
  Copyright,
  HelpCircle,
  Images,
  LayoutGrid,
  LayoutTemplate,
  Mail,
  Megaphone,
  Quote,
  ShieldCheck,
  ShoppingBag,
  Sparkle,
} from "lucide-react";
import type {
  HomeSectionType,
  HomepageSection,
  HomepageSectionConfig,
  ProductSource,
} from "@/lib/api/storefront";
import {
  useCreateHomepageSection,
  useDeleteHomepageSection,
  useReorderHomepageSections,
  useUpdateHomepageSection,
} from "@/lib/api/hooks/storefront";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { CategoryPicker } from "@/components/ui/CategoryPicker";
import { IconPicker } from "@/components/ui/IconPicker";
import { ImageField } from "@/components/ui/ImageField";
import { Select } from "@/components/ui/Select";
import { Field, Input, Panel, Textarea, Toggle } from "@/components/ui/Form";
import { Glyph } from "@/components/ui/Glyph";
import { dollarsToCents, centsToDollars } from "@/lib/format";
import { cn } from "@/lib/utils";

const STORE_FOLDER = "techistan/store";

/**
 * What each block type is, in the admin's words.
 *
 * The boolean flags list which of the shared presentation fields the type
 * actually uses, so the editor can hide the ones that would do nothing — a
 * TRUST_BAR has no heading and a NEWSLETTER has no "view all" link, and showing
 * those inputs anyway teaches the admin that half the form is decorative.
 *
 * Adding a type here is most of the work of adding a block: the form is driven
 * by these flags, so a new type only needs its own fieldset when it carries
 * settings nothing else has (so far, only SPOTLIGHT does).
 */
const SECTION_TYPES: Record<
  HomeSectionType,
  {
    label: string;
    description: string;
    icon: LucideIcon;
    heading: boolean;
    link: boolean;
    products: boolean;
    artwork: boolean;
    /** Shows the "how many" input — for blocks that render a bounded set. */
    count?: boolean;
  }
> = {
  HERO: {
    label: "Hero carousel",
    description: "The slides at the top of the page.",
    icon: LayoutTemplate,
    heading: false,
    link: false,
    products: false,
    artwork: false,
  },
  TRUST_BAR: {
    label: "Service promises",
    description: "Shipping, warranty, returns and support.",
    icon: ShieldCheck,
    heading: false,
    link: false,
    products: false,
    artwork: false,
  },
  CATEGORY_RAIL: {
    label: "Category rail",
    description: "A swipable row of category posters.",
    icon: Images,
    heading: true,
    link: true,
    products: false,
    artwork: false,
  },
  CATEGORY_GRID: {
    label: "Category grid",
    description: "A mosaic with one large lead tile. Best near the top.",
    icon: LayoutGrid,
    heading: true,
    link: true,
    products: false,
    artwork: false,
  },
  PRODUCT_RAIL: {
    label: "Product rail",
    description: "A swipable row of product cards from a source you choose.",
    icon: ShoppingBag,
    heading: true,
    link: true,
    products: true,
    artwork: false,
  },
  SPOTLIGHT: {
    label: "Product spotlight",
    description: "One product, given a whole band. Leave blank to auto-pick.",
    icon: Sparkle,
    heading: true,
    link: false,
    products: false,
    artwork: false,
  },
  PROMO_TILES: {
    label: "Promo tiles",
    description: "Editorial poster blocks between the rails.",
    icon: BadgePercent,
    heading: false,
    link: false,
    products: false,
    artwork: false,
  },
  BANNER: {
    label: "Banner",
    description: "A single full-width panel with a headline and a button.",
    icon: Megaphone,
    heading: true,
    link: true,
    products: false,
    artwork: true,
  },
  BRAND_STRIP: {
    label: "Brand strip",
    description: "The brands you stock, drawn from the catalog.",
    icon: Copyright,
    heading: true,
    link: false,
    products: false,
    artwork: false,
    count: true,
  },
  TESTIMONIALS: {
    label: "Customer reviews",
    description: "Real approved 4-star-and-up reviews. Not editable copy.",
    icon: Quote,
    heading: true,
    link: true,
    products: false,
    artwork: false,
    count: true,
  },
  FAQ: {
    label: "Questions & answers",
    description: "The fixed pre-purchase FAQ.",
    icon: HelpCircle,
    heading: true,
    link: false,
    products: false,
    artwork: false,
  },
  NEWSLETTER: {
    label: "Newsletter signup",
    description: "The email capture block.",
    icon: Mail,
    heading: true,
    link: false,
    products: false,
    artwork: false,
  },
};

const PRODUCT_SOURCES: {
  value: ProductSource;
  label: string;
  description: string;
}[] = [
  {
    value: "FEATURED",
    label: "Featured",
    description: "Best rated, then most recent",
  },
  {
    value: "NEWEST",
    label: "New arrivals",
    description: "Most recently added",
  },
  {
    value: "ON_SALE",
    label: "On sale",
    description: "Products with a live sale",
  },
  {
    value: "BEST_SELLING",
    label: "Best selling",
    description: "Falls back to newest until order data exists",
  },
  {
    value: "TOP_RATED",
    label: "Top rated",
    description: "Highest average rating",
  },
  {
    value: "CATEGORY",
    label: "From a category",
    description: "Everything in one category",
  },
  { value: "TAG", label: "From a tag", description: "Products carrying a tag" },
  {
    value: "PRICE_UNDER",
    label: "Under a price",
    description: "A value-hunting rail",
  },
];

/**
 * The homepage's block list.
 *
 * The storefront homepage was a fixed sequence of components: reordering it,
 * retiring a rail, or adding a seasonal banner all meant editing JSX and
 * deploying. Here the sequence is rows an admin can order, toggle and
 * configure, and the storefront renders whatever it is given (skipping any type
 * it does not recognise, so the two can ship independently).
 */
export function SectionEditor({ sections }: { sections: HomepageSection[] }) {
  const create = useCreateHomepageSection();
  const reorder = useReorderHomepageSections();
  const [openId, setOpenId] = useState<string | null>(null);
  const [addType, setAddType] = useState<HomeSectionType>("PRODUCT_RAIL");

  const move = (index: number, direction: -1 | 1) => {
    const current = sections[index];
    const target = sections[index + direction];
    if (!current || !target) return;
    reorder.mutate([
      { id: current.id, sortOrder: target.sortOrder },
      { id: target.id, sortOrder: current.sortOrder },
    ]);
  };

  return (
    <Panel
      title="Page sections"
      description="Everything below the hero, in the order shoppers see it."
      actions={
        <div className="flex items-center gap-2">
          <Select<HomeSectionType>
            label="Section type to add"
            className="min-w-[12rem]"
            value={addType}
            onChange={setAddType}
            options={Object.entries(SECTION_TYPES).map(([value, meta]) => ({
              value: value as HomeSectionType,
              label: meta.label,
              description: meta.description,
              icon: <Glyph icon={meta.icon} className="h-4 w-4" />,
            }))}
          />
          <button
            type="button"
            disabled={create.isPending}
            onClick={() =>
              create.mutate(
                {
                  type: addType,
                  enabled: false,
                  title: SECTION_TYPES[addType].heading
                    ? SECTION_TYPES[addType].label
                    : null,
                  config:
                    addType === "PRODUCT_RAIL"
                      ? { source: "FEATURED", limit: 12 }
                      : {},
                },
                { onSuccess: (section) => setOpenId(section.id) },
              )
            }
            className="bg-primary text-primary-foreground inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Plus className="h-4 w-4" aria-hidden />
            )}
            Add
          </button>
        </div>
      }
    >
      {sections.length === 0 ? (
        <p className="border-border text-muted-foreground rounded-lg border border-dashed py-10 text-center text-sm">
          No sections yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {sections.map((section, index) => (
            <SectionRow
              key={section.id}
              section={section}
              open={openId === section.id}
              onToggle={() =>
                setOpenId(openId === section.id ? null : section.id)
              }
              onMoveUp={index > 0 ? () => move(index, -1) : undefined}
              onMoveDown={
                index < sections.length - 1 ? () => move(index, 1) : undefined
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SectionRow({
  section,
  open,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  section: HomepageSection;
  open: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const update = useUpdateHomepageSection();
  const remove = useDeleteHomepageSection();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const meta = SECTION_TYPES[section.type];
  const config = section.config ?? {};

  const [draft, setDraft] = useState({
    eyebrow: section.eyebrow ?? "",
    title: section.title ?? "",
    subtitle: section.subtitle ?? "",
    href: section.href ?? "",
    linkLabel: section.linkLabel ?? "",
    source: (config.source ?? "FEATURED") as ProductSource,
    categoryId: config.categoryId ?? null,
    tag: config.tag ?? "",
    maxPrice: config.maxPrice != null ? centsToDollars(config.maxPrice) : "",
    limit: String(config.limit ?? 12),
    icon: config.icon ?? null,
    imageId: config.imageId ?? null,
    imageUrl: config.imageUrl ?? null,
    ctaLabel: config.ctaLabel ?? "",
    featuredOnly: config.featuredOnly ?? false,
    productSlug: config.productSlug ?? "",
    secondaryLabel: config.secondaryLabel ?? "",
    secondaryHref: config.secondaryHref ?? "",
  });

  const save = () => {
    const nextConfig: HomepageSectionConfig = {};
    if (meta.products) {
      nextConfig.source = draft.source;
      nextConfig.limit = parseInt(draft.limit, 10) || 12;
      if (draft.source === "CATEGORY") {
        nextConfig.categoryId = draft.categoryId ?? undefined;
      }
      if (draft.source === "TAG") nextConfig.tag = draft.tag.trim();
      if (draft.source === "PRICE_UNDER") {
        const cents = dollarsToCents(draft.maxPrice);
        if (cents != null && !Number.isNaN(cents)) nextConfig.maxPrice = cents;
      }
    }
    if (section.type === "CATEGORY_RAIL" || section.type === "CATEGORY_GRID") {
      nextConfig.limit = parseInt(draft.limit, 10) || 12;
      nextConfig.featuredOnly = draft.featuredOnly;
    }
    if (meta.count) nextConfig.limit = parseInt(draft.limit, 10) || 12;
    if (section.type === "SPOTLIGHT") {
      // Blank means "pick the best-rated featured product", which is the state
      // this block ships in — so an empty box is a real setting, not an error.
      nextConfig.productSlug = draft.productSlug.trim() || undefined;
      nextConfig.secondaryLabel = draft.secondaryLabel.trim() || undefined;
      nextConfig.secondaryHref = draft.secondaryHref.trim() || undefined;
    }
    if (meta.artwork) {
      nextConfig.imageId = draft.imageId ?? undefined;
      nextConfig.imageUrl = draft.imageUrl ?? undefined;
      nextConfig.ctaLabel = draft.ctaLabel.trim() || undefined;
    }
    if (meta.heading && draft.icon) nextConfig.icon = draft.icon;

    update.mutate({
      id: section.id,
      input: {
        eyebrow: draft.eyebrow.trim() || null,
        title: draft.title.trim() || null,
        subtitle: draft.subtitle.trim() || null,
        href: draft.href.trim() || null,
        linkLabel: draft.linkLabel.trim() || null,
        config: nextConfig,
      },
    });
  };

  return (
    <li className="border-border bg-background overflow-hidden rounded-lg border">
      <div className="flex items-center gap-3 p-3">
        <GripVertical
          className="text-muted-foreground h-4 w-4 shrink-0"
          aria-hidden
        />
        <span
          className={cn(
            "grid h-9 w-9 shrink-0 place-items-center rounded-lg",
            section.enabled
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
          aria-hidden
        >
          <Glyph icon={meta.icon} className="h-4 w-4" />
        </span>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium">
            {section.title || meta.label}
          </span>
          <span className="text-muted-foreground block truncate text-xs">
            {meta.label}
            {section.type === "PRODUCT_RAIL" && config.source
              ? ` · ${PRODUCT_SOURCES.find((s) => s.value === config.source)?.label ?? config.source}`
              : ""}
          </span>
        </button>

        <Toggle
          srLabel={`Show "${section.title || meta.label}" on the homepage`}
          checked={section.enabled}
          revertOn={update.isError}
          onChange={(enabled) =>
            update.mutate({ id: section.id, input: { enabled } })
          }
        />

        <IconBtn label="Move up" onClick={onMoveUp} disabled={!onMoveUp}>
          <ChevronUp className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Move down" onClick={onMoveDown} disabled={!onMoveDown}>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn
          label="Delete section"
          danger
          onClick={() => setConfirmDelete(true)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconBtn>
      </div>

      {open && (
        <div className="border-border space-y-4 border-t p-4">
          {!meta.heading && !meta.products && !meta.artwork && !meta.count && (
            <p className="text-muted-foreground text-sm">
              {meta.description} Nothing to configure — use the switch above to
              show or hide it, and the arrows to move it.
            </p>
          )}

          {meta.heading && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Eyebrow" hint="Small label above the heading.">
                <Input
                  value={draft.eyebrow}
                  onChange={(e) =>
                    setDraft({ ...draft, eyebrow: e.target.value })
                  }
                  placeholder="Hand-picked"
                />
              </Field>
              <Field label="Heading">
                <Input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  placeholder="Featured this week"
                />
              </Field>
              <Field label="Sub-heading" className="sm:col-span-2">
                <Textarea
                  rows={2}
                  value={draft.subtitle}
                  onChange={(e) =>
                    setDraft({ ...draft, subtitle: e.target.value })
                  }
                />
              </Field>
              <Field label="Heading icon">
                <IconPicker
                  label="Heading icon"
                  value={draft.icon}
                  onChange={(icon) => setDraft({ ...draft, icon })}
                />
              </Field>
            </div>
          )}

          {meta.link && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label='"View all" link'
                hint="A storefront path. Leave blank to hide the link."
              >
                <Input
                  value={draft.href}
                  onChange={(e) => setDraft({ ...draft, href: e.target.value })}
                  placeholder="/search"
                />
              </Field>
              <Field label="Link label">
                <Input
                  value={draft.linkLabel}
                  onChange={(e) =>
                    setDraft({ ...draft, linkLabel: e.target.value })
                  }
                  placeholder="View all"
                />
              </Field>
            </div>
          )}

          {meta.products && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Products from">
                <Select<ProductSource>
                  label="Product source"
                  value={draft.source}
                  onChange={(source) => setDraft({ ...draft, source })}
                  options={PRODUCT_SOURCES}
                />
              </Field>
              <Field label="How many" hint="Cards in the rail.">
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={draft.limit}
                  onChange={(e) =>
                    setDraft({ ...draft, limit: e.target.value })
                  }
                />
              </Field>

              {draft.source === "CATEGORY" && (
                <Field label="Category" className="sm:col-span-2">
                  <CategoryPicker
                    label="Rail category"
                    value={draft.categoryId}
                    onChange={(categoryId) =>
                      setDraft({ ...draft, categoryId })
                    }
                    allowNone={false}
                    placeholder="Choose a category…"
                  />
                </Field>
              )}
              {draft.source === "TAG" && (
                <Field label="Tag slug" hint="For example, on-sale.">
                  <Input
                    value={draft.tag}
                    onChange={(e) =>
                      setDraft({ ...draft, tag: e.target.value })
                    }
                    placeholder="on-sale"
                  />
                </Field>
              )}
              {draft.source === "PRICE_UNDER" && (
                <Field label="Price ceiling" hint="In dollars.">
                  <Input
                    value={draft.maxPrice}
                    onChange={(e) =>
                      setDraft({ ...draft, maxPrice: e.target.value })
                    }
                    inputMode="decimal"
                    placeholder="100.00"
                  />
                </Field>
              )}
            </div>
          )}

          {section.type === "SPOTLIGHT" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Product slug"
                className="sm:col-span-2"
                hint="From the product's URL. Leave blank to feature the best-rated featured product automatically."
              >
                <Input
                  value={draft.productSlug}
                  onChange={(e) =>
                    setDraft({ ...draft, productSlug: e.target.value })
                  }
                  placeholder="corevex-office-keyboard"
                />
              </Field>
              <Field
                label="Second button"
                hint="Sits beside View details. Both fields are needed to show it."
              >
                <Input
                  value={draft.secondaryLabel}
                  onChange={(e) =>
                    setDraft({ ...draft, secondaryLabel: e.target.value })
                  }
                  placeholder="See all featured"
                />
              </Field>
              <Field label="Second button link">
                <Input
                  value={draft.secondaryHref}
                  onChange={(e) =>
                    setDraft({ ...draft, secondaryHref: e.target.value })
                  }
                  placeholder="/search"
                />
              </Field>
            </div>
          )}

          {meta.count && (
            <Field
              label="How many"
              hint={
                section.type === "TESTIMONIALS"
                  ? "Reviews to show. Fewer are shown if fewer qualify."
                  : "Brands to show, busiest first."
              }
            >
              <Input
                type="number"
                min={1}
                max={24}
                value={draft.limit}
                onChange={(e) => setDraft({ ...draft, limit: e.target.value })}
              />
            </Field>
          )}

          {(section.type === "CATEGORY_RAIL" ||
            section.type === "CATEGORY_GRID") && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="How many"
                hint={
                  section.type === "CATEGORY_GRID"
                    ? "A ceiling on the tiles. The grid re-flows to fill whatever you have."
                    : "Posters in the rail."
                }
              >
                <Input
                  type="number"
                  min={1}
                  max={24}
                  value={draft.limit}
                  onChange={(e) =>
                    setDraft({ ...draft, limit: e.target.value })
                  }
                />
              </Field>
              <Toggle
                label="Featured categories only"
                description="Uses the Featured flag on each category."
                checked={draft.featuredOnly}
                onChange={(featuredOnly) =>
                  setDraft({ ...draft, featuredOnly })
                }
              />
            </div>
          )}

          {meta.artwork && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Button label">
                <Input
                  value={draft.ctaLabel}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaLabel: e.target.value })
                  }
                  placeholder="Shop now"
                />
              </Field>
              <Field label="Background image" className="sm:col-span-2">
                <ImageField
                  publicId={draft.imageId}
                  url={draft.imageUrl}
                  folder={STORE_FOLDER}
                  aspect="banner"
                  alt={draft.title}
                  onChange={({ publicId, url }) =>
                    setDraft({ ...draft, imageId: publicId, imageUrl: url })
                  }
                />
              </Field>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onToggle}
              className="border-border hover:bg-muted rounded-md border px-3 py-1.5 text-sm font-medium"
            >
              Close
            </button>
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium hover:opacity-90 disabled:opacity-60"
            >
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Save section
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Remove the ${meta.label.toLowerCase()}?`}
        description="It disappears from the homepage. You can add it back later, but its settings are not kept."
        confirmLabel="Remove"
        tone="danger"
        loading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync(section.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
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
        "text-muted-foreground hover:bg-muted rounded p-1.5 transition-colors disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
