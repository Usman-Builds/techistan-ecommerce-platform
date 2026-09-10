"use client";

import { useState } from "react";
import Image from "next/image";
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageOff,
  Loader2,
  Plus,
  Trash2,
} from "lucide-react";
import type { HeroSlide } from "@/lib/api/storefront";
import {
  useCreateHeroSlide,
  useDeleteHeroSlide,
  useReorderHeroSlides,
  useUpdateHeroSlide,
} from "@/lib/api/hooks/storefront";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ImageField } from "@/components/ui/ImageField";
import { Field, Input, Panel, Textarea, Toggle } from "@/components/ui/Form";
import { cn } from "@/lib/utils";

const STORE_FOLDER = "techistan/store";

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
}
function fromLocalInput(v: string): string | null {
  return v.trim() ? new Date(v).toISOString() : null;
}

/** Whether a slide is live right now, given its enabled flag and window. */
function liveState(slide: HeroSlide): {
  label: string;
  tone: "success" | "warning" | "neutral";
} {
  if (!slide.enabled) return { label: "Hidden", tone: "neutral" };
  const now = Date.now();
  if (slide.startsAt && new Date(slide.startsAt).getTime() > now) {
    return { label: "Scheduled", tone: "warning" };
  }
  if (slide.endsAt && new Date(slide.endsAt).getTime() < now) {
    return { label: "Ended", tone: "neutral" };
  }
  return { label: "Live", tone: "success" };
}

/**
 * The hero carousel's slides.
 *
 * Hero slides used to be DERIVED — the storefront synthesised them from
 * whichever categories happened to have artwork, with hard-coded copy like
 * "{Category}, properly specced". That is fine as a default and useless as a
 * marketing surface: there was no way to run a Black Friday hero, or to write
 * your own headline.
 *
 * Scheduling is per slide rather than per carousel because that is how
 * campaigns actually run — a seasonal slide should retire on its own date
 * without anyone remembering to remove it.
 */
export function HeroSlideEditor({ slides }: { slides: HeroSlide[] }) {
  const create = useCreateHeroSlide();
  const reorder = useReorderHeroSlides();
  const [openId, setOpenId] = useState<string | null>(null);

  const move = (index: number, direction: -1 | 1) => {
    const target = slides[index + direction];
    const current = slides[index];
    if (!target || !current) return;
    reorder.mutate([
      { id: current.id, sortOrder: target.sortOrder },
      { id: target.id, sortOrder: current.sortOrder },
    ]);
  };

  return (
    <Panel
      title="Hero carousel"
      description="The slides at the very top of the homepage."
      actions={
        <button
          type="button"
          onClick={() =>
            create.mutate(
              { title: "New slide", enabled: false },
              { onSuccess: (slide) => setOpenId(slide.id) },
            )
          }
          disabled={create.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          {create.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Plus className="h-4 w-4" aria-hidden />
          )}
          Add slide
        </button>
      }
    >
      {slides.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No slides yet. Until you add one, the storefront falls back to a hero
          built from your categories.
        </p>
      ) : (
        <ul className="space-y-2">
          {slides.map((slide, index) => (
            <SlideRow
              key={slide.id}
              slide={slide}
              open={openId === slide.id}
              onToggle={() => setOpenId(openId === slide.id ? null : slide.id)}
              onMoveUp={index > 0 ? () => move(index, -1) : undefined}
              onMoveDown={
                index < slides.length - 1 ? () => move(index, 1) : undefined
              }
            />
          ))}
        </ul>
      )}
    </Panel>
  );
}

function SlideRow({
  slide,
  open,
  onToggle,
  onMoveUp,
  onMoveDown,
}: {
  slide: HeroSlide;
  open: boolean;
  onToggle: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  const update = useUpdateHeroSlide();
  const remove = useDeleteHeroSlide();
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Draft state, committed on Save. A hero slide is prose plus artwork — saving
  // on every keystroke would write a dozen half-typed headlines.
  const [draft, setDraft] = useState({
    eyebrow: slide.eyebrow ?? "",
    title: slide.title,
    subtitle: slide.subtitle ?? "",
    ctaLabel: slide.ctaLabel ?? "",
    ctaHref: slide.ctaHref ?? "",
    imageId: slide.imageId,
    imageUrl: slide.imageUrl,
    startsAt: toLocalInput(slide.startsAt),
    endsAt: toLocalInput(slide.endsAt),
  });

  const state = liveState(slide);

  const save = () =>
    update.mutate({
      id: slide.id,
      input: {
        eyebrow: draft.eyebrow.trim() || null,
        title: draft.title.trim() || "Untitled slide",
        subtitle: draft.subtitle.trim() || null,
        ctaLabel: draft.ctaLabel.trim() || null,
        ctaHref: draft.ctaHref.trim() || null,
        imageId: draft.imageId,
        imageUrl: draft.imageUrl,
        startsAt: fromLocalInput(draft.startsAt),
        endsAt: fromLocalInput(draft.endsAt),
      },
    });

  return (
    <li className="overflow-hidden rounded-lg border border-border bg-background">
      <div className="flex items-center gap-3 p-3">
        <GripVertical
          className="h-4 w-4 shrink-0 text-muted-foreground"
          aria-hidden
        />

        {slide.imageUrl ? (
          <span className="relative block h-10 w-16 shrink-0 overflow-hidden rounded bg-muted">
            <Image
              src={slide.imageUrl}
              alt=""
              fill
              sizes="64px"
              className="object-cover"
            />
          </span>
        ) : (
          <span className="grid h-10 w-16 shrink-0 place-items-center rounded bg-muted text-muted-foreground">
            <ImageOff className="h-4 w-4" aria-hidden />
          </span>
        )}

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium">
            {slide.title}
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-block h-1.5 w-1.5 rounded-full",
                state.tone === "success" && "bg-success",
                state.tone === "warning" && "bg-warning",
                state.tone === "neutral" && "bg-muted-foreground",
              )}
              aria-hidden
            />
            {state.label}
            {(slide.startsAt || slide.endsAt) && (
              <>
                <CalendarClock className="h-3 w-3" aria-hidden />
                scheduled
              </>
            )}
          </span>
        </button>

        <Toggle
          srLabel={`Show the "${slide.title}" slide`}
          checked={slide.enabled}
          revertOn={update.isError}
          onChange={(enabled) =>
            update.mutate({ id: slide.id, input: { enabled } })
          }
        />

        <IconBtn label="Move up" onClick={onMoveUp} disabled={!onMoveUp}>
          <ChevronUp className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Move down" onClick={onMoveDown} disabled={!onMoveDown}>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </IconBtn>
        <IconBtn label="Delete slide" danger onClick={() => setConfirmDelete(true)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </IconBtn>
      </div>

      {open && (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Eyebrow" hint="Small label above the headline.">
              <Input
                value={draft.eyebrow}
                onChange={(e) =>
                  setDraft({ ...draft, eyebrow: e.target.value })
                }
                placeholder="This week only"
              />
            </Field>
            <Field label="Headline" required>
              <Input
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Deals on the tech you actually want"
              />
            </Field>
            <Field label="Body" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={draft.subtitle}
                onChange={(e) =>
                  setDraft({ ...draft, subtitle: e.target.value })
                }
              />
            </Field>
            <Field label="Button label">
              <Input
                value={draft.ctaLabel}
                onChange={(e) =>
                  setDraft({ ...draft, ctaLabel: e.target.value })
                }
                placeholder="Shop the deals"
              />
            </Field>
            <Field label="Button link" hint="A storefront path, e.g. /deals.">
              <Input
                value={draft.ctaHref}
                onChange={(e) =>
                  setDraft({ ...draft, ctaHref: e.target.value })
                }
                placeholder="/deals"
              />
            </Field>
            <Field
              label="Starts"
              hint="Leave blank to show as soon as it is enabled."
            >
              <Input
                type="datetime-local"
                value={draft.startsAt}
                onChange={(e) =>
                  setDraft({ ...draft, startsAt: e.target.value })
                }
              />
            </Field>
            <Field label="Ends" hint="Leave blank to run indefinitely.">
              <Input
                type="datetime-local"
                value={draft.endsAt}
                onChange={(e) => setDraft({ ...draft, endsAt: e.target.value })}
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
              Save slide
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete "${slide.title}"?`}
        description="The slide is removed from the carousel. This cannot be undone."
        confirmLabel="Delete"
        tone="danger"
        loading={remove.isPending}
        onConfirm={async () => {
          await remove.mutateAsync(slide.id);
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
        "rounded p-1.5 text-muted-foreground transition-colors hover:bg-muted disabled:opacity-30",
        danger ? "hover:text-destructive" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
