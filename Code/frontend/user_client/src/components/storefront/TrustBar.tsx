import { Headset, RotateCcw, ShieldCheck, Truck } from "lucide-react";

/**
 * Service-promise strip that sits directly under the hero — four short promises
 * answering "can I trust this shop?" before the visitor has scrolled to a single
 * product.
 *
 * All four icons are the same brand gold. They used to be four different hues,
 * which implied a distinction between the promises that doesn't exist: they are
 * one set, and they should look like one set.
 *
 * Copy is deliberately free of specific numbers (no "free over $150"): the
 * public /settings payload doesn't carry the shipping zones, so any threshold
 * printed here would be a hard-coded guess that could contradict what checkout
 * actually charges.
 */
const PROMISES: { icon: typeof Truck; title: string; body: string }[] = [
  {
    icon: Truck,
    title: "Fast shipping",
    body: "Dispatched within 24 hours",
  },
  {
    icon: ShieldCheck,
    title: "2-year warranty",
    body: "Every device covered, parts and labour",
  },
  {
    icon: RotateCcw,
    title: "30-day returns",
    body: "Changed your mind? Send it back",
  },
  {
    icon: Headset,
    title: "Expert support",
    body: "Real specialists, seven days a week",
  },
];

export function TrustBar() {
  return (
    <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {PROMISES.map(({ icon: Icon, title, body }) => (
        <li
          key={title}
          className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"
            aria-hidden
          >
            <Icon className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{title}</span>
            <span className="block text-xs text-muted-foreground">{body}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
