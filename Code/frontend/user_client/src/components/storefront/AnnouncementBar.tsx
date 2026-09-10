import Link from "next/link";
import { Megaphone } from "lucide-react";

/**
 * The thin strip above the header.
 *
 * Rendered only when the merchant has both enabled it and written something —
 * that decision is already made server-side (`settings.announcement` is null
 * otherwise), so there is no logic to duplicate here.
 *
 * Flat brand colour with no gradient, matching the rest of the chrome. When a
 * link is set the whole strip is the target, since a 32px band is a poor place
 * to aim at a few words of text.
 */
export function AnnouncementBar({
  announcement,
}: {
  announcement: { text: string; href: string | null } | null;
}) {
  if (!announcement) return null;

  const content = (
    <span className="flex items-center justify-center gap-2 px-4 py-1.5 text-center text-xs font-medium sm:text-sm">
      <Megaphone className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {announcement.text}
    </span>
  );

  if (!announcement.href) {
    return (
      <div className="bg-primary text-primary-foreground">{content}</div>
    );
  }

  return (
    <Link
      href={announcement.href}
      className="block bg-primary text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/60"
    >
      {content}
    </Link>
  );
}
