"use client";

import { useState } from "react";
import { ExternalLink, Loader2, Menu, PanelBottom, Sparkles } from "lucide-react";
import { useNavItems, useSeedNavigation } from "@/lib/api/hooks/storefront";
import {
  useAdminSettings,
  useUpdateSettings,
} from "@/lib/api/hooks/settings";
import { NavigationManager } from "@/components/storefront/NavigationManager";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Field, Input, Panel, Textarea, Toggle } from "@/components/ui/Form";
import { SegmentedControl } from "@/components/ui/Form";
import type { NavLocation } from "@/lib/api/storefront";

const STOREFRONT_URL =
  process.env.NEXT_PUBLIC_STOREFRONT_URL ?? "http://localhost:3001";

/**
 * Header and footer editor.
 *
 * The two menus live behind one segmented control rather than on two pages:
 * they are the same model with the same controls, and a merchant moving a link
 * from the header to the footer should not have to navigate to do it.
 *
 * Below them sits the chrome that is NOT a link — the announcement strip and
 * the footer copy — because that is where an admin looks for it, even though it
 * is stored on the settings singleton rather than in the navigation table.
 */
export default function NavigationPage() {
  const [location, setLocation] = useState<NavLocation>("HEADER");
  const { data: items } = useNavItems(location);
  const seed = useSeedNavigation();
  const [confirmSeed, setConfirmSeed] = useState(false);

  const isEmpty = (items?.length ?? 0) === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
            <Menu className="h-6 w-6" aria-hidden /> Navigation
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            The header and footer menus. Two levels: a top-level entry is a
            dropdown in the header and a column heading in the footer.
          </p>
        </div>
        <a
          href={STOREFRONT_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          View storefront
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
      </div>

      <Panel
        title={location === "HEADER" ? "Header menu" : "Footer menu"}
        description={
          location === "HEADER"
            ? "Shown in the navigation row under the search bar."
            : "The link columns at the bottom of every page."
        }
        actions={
          <div className="flex items-center gap-2">
            <SegmentedControl<NavLocation>
              label="Menu"
              value={location}
              onChange={setLocation}
              options={[
                {
                  value: "HEADER",
                  label: "Header",
                  icon: <Menu className="h-4 w-4" aria-hidden />,
                },
                {
                  value: "FOOTER",
                  label: "Footer",
                  icon: <PanelBottom className="h-4 w-4" aria-hidden />,
                },
              ]}
            />
            <button
              type="button"
              onClick={() => setConfirmSeed(true)}
              disabled={seed.isPending}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {seed.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Sparkles className="h-4 w-4" aria-hidden />
              )}
              Build from categories
            </button>
          </div>
        }
      >
        {isEmpty && (
          <p className="mb-4 rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            This menu is empty, so the storefront is still deriving it from your
            categories. Add an entry — or press &ldquo;Build from
            categories&rdquo; — to take control of it.
          </p>
        )}
        <NavigationManager location={location} />
      </Panel>

      <AnnouncementAndFooterCopy />

      <ConfirmDialog
        open={confirmSeed}
        title={`Rebuild the ${location === "HEADER" ? "header" : "footer"} from your categories?`}
        description={
          isEmpty
            ? "This creates a starting menu from your visible categories. You can edit everything afterwards."
            : "Every entry in this menu is replaced with one built from your visible categories. This cannot be undone."
        }
        confirmLabel="Rebuild menu"
        tone={isEmpty ? "primary" : "danger"}
        loading={seed.isPending}
        onConfirm={async () => {
          await seed.mutateAsync({ location, replace: !isEmpty });
          setConfirmSeed(false);
        }}
        onCancel={() => setConfirmSeed(false)}
      />
    </div>
  );
}

/**
 * Store chrome that lives on the settings singleton rather than in NavItem,
 * because none of it is a link: the strip above the header, and the two pieces
 * of footer copy.
 */
function AnnouncementAndFooterCopy() {
  const { data: settings, isLoading } = useAdminSettings();
  const update = useUpdateSettings();
  const [draft, setDraft] = useState<{
    announcementText: string;
    announcementHref: string;
    announcementEnabled: boolean;
    footerTagline: string;
    footerNote: string;
  } | null>(null);

  // Seed the draft once, from whichever fetch lands first.
  const state = draft ?? {
    announcementText: settings?.announcementText ?? "",
    announcementHref: settings?.announcementHref ?? "",
    announcementEnabled: settings?.announcementEnabled ?? false,
    footerTagline: settings?.footerTagline ?? "",
    footerNote: settings?.footerNote ?? "",
  };
  const set = (patch: Partial<typeof state>) =>
    setDraft({ ...state, ...patch });

  const save = () =>
    update.mutate({
      announcementText: state.announcementText.trim() || null,
      announcementHref: state.announcementHref.trim() || null,
      announcementEnabled: state.announcementEnabled,
      footerTagline: state.footerTagline.trim() || null,
      footerNote: state.footerNote.trim() || null,
    });

  return (
    <Panel
      title="Header and footer copy"
      description="The parts that are text rather than links."
    >
      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Loading…
        </div>
      ) : (
        <div className="space-y-4">
          <Toggle
            label="Show the announcement strip"
            description="A thin band above the header. Hidden if the message is blank."
            checked={state.announcementEnabled}
            onChange={(announcementEnabled) => set({ announcementEnabled })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Announcement" htmlFor="announcement-text">
              <Input
                id="announcement-text"
                value={state.announcementText}
                onChange={(e) => set({ announcementText: e.target.value })}
                placeholder="Free shipping on orders over $99"
                maxLength={200}
                disabled={!state.announcementEnabled}
              />
            </Field>
            <Field
              label="Announcement link"
              htmlFor="announcement-href"
              hint="Optional. Makes the whole strip clickable."
            >
              <Input
                id="announcement-href"
                value={state.announcementHref}
                onChange={(e) => set({ announcementHref: e.target.value })}
                placeholder="/deals"
                disabled={!state.announcementEnabled}
              />
            </Field>

            <Field
              label="Footer tagline"
              htmlFor="footer-tagline"
              hint="The blurb under your logo in the footer."
              className="sm:col-span-2"
            >
              <Textarea
                id="footer-tagline"
                rows={2}
                value={state.footerTagline}
                onChange={(e) => set({ footerTagline: e.target.value })}
                placeholder="Laptops, phones, audio and gaming gear — curated, fairly priced, and shipped fast."
                maxLength={300}
              />
            </Field>

            <Field
              label="Copyright line"
              htmlFor="footer-note"
              hint="Leave blank for the default © line."
              className="sm:col-span-2"
            >
              <Input
                id="footer-note"
                value={state.footerNote}
                onChange={(e) => set({ footerNote: e.target.value })}
                maxLength={200}
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-3">
            {update.isSuccess && !draft && (
              <span className="text-sm text-success">Saved.</span>
            )}
            <button
              type="button"
              onClick={save}
              disabled={update.isPending}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
            >
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              )}
              Save copy
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
