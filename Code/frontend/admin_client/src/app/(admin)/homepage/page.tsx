"use client";

import { useState } from "react";
import { ExternalLink, Loader2, LayoutTemplate, RotateCcw } from "lucide-react";
import {
  useAdminHomepage,
  useSeedHomepage,
} from "@/lib/api/hooks/storefront";
import { HeroSlideEditor } from "@/components/storefront/HeroSlideEditor";
import { SectionEditor } from "@/components/storefront/SectionEditor";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3001";

/**
 * Homepage builder.
 *
 * Two lists, because the homepage really is two things: an ordered stack of
 * blocks, and the carousel that sits above them. Both are ordered, toggleable
 * rows rather than a canvas — a drag-and-drop page builder would be a much
 * larger surface to get wrong, and every block here has a fixed, opinionated
 * design already.
 *
 * An unconfigured store gets the built-in default layout on the storefront, so
 * this screen is opt-in: nothing changes until "Set up the default layout" is
 * pressed, and from then on these rows are the page.
 */
export default function HomepagePage() {
  const { data, isLoading, isError } = useAdminHomepage();
  const seed = useSeedHomepage();
  const [confirmReset, setConfirmReset] = useState(false);

  const configured = (data?.sections.length ?? 0) > 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <LayoutTemplate className="h-6 w-6" aria-hidden /> Homepage
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The blocks that make up the storefront home page, in order. Toggle
            one off to hide it without losing its settings.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            href={STOREFRONT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            View storefront
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
          {configured && (
            <button
              type="button"
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            >
              <RotateCcw className="h-4 w-4" aria-hidden />
              Reset to default
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError || !data ? (
        <p className="py-16 text-center text-destructive">
          Could not load the homepage layout.
        </p>
      ) : !configured ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <LayoutTemplate
            className="mx-auto h-8 w-8 text-muted-foreground"
            aria-hidden
          />
          <h2 className="mt-3 font-heading text-lg font-bold">
            The homepage is on its defaults
          </h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Your storefront is showing the built-in layout — a hero, service
            promises, category and product rails, and a newsletter block. Set it
            up here to start reordering, retiring and adding to it.
          </p>
          <button
            type="button"
            onClick={() => seed.mutate(false)}
            disabled={seed.isPending}
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {seed.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Set up the default layout
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            This copies the current layout in as editable blocks. Nothing on the
            storefront changes until you edit them.
          </p>
        </div>
      ) : (
        <>
          <HeroSlideEditor slides={data.slides} />
          <SectionEditor sections={data.sections} />
        </>
      )}

      <ConfirmDialog
        open={confirmReset}
        title="Reset the homepage to its default layout?"
        description="Every section and hero slide you have configured is deleted and replaced with the built-in layout. This cannot be undone."
        confirmLabel="Reset homepage"
        tone="danger"
        loading={seed.isPending}
        onConfirm={async () => {
          await seed.mutateAsync(true);
          setConfirmReset(false);
        }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  );
}
