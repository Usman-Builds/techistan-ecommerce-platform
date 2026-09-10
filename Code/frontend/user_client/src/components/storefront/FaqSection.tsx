import Link from "next/link";
import { ArrowRight, HelpCircle } from "lucide-react";
import { SectionHeading } from "./SectionHeading";
import { getSettingsServer } from "@/lib/api/settings";

/**
 * The short pre-purchase FAQ that sits near the foot of the homepage.
 *
 * Built on native `<details>` rather than a React accordion: no state, no
 * client bundle, keyboard and screen-reader behaviour for free, and the answers
 * are in the HTML for search engines whether or not they are open. This is a
 * Server Component, and the whole block costs the page zero JavaScript.
 *
 * The copy is fixed here, alongside `TrustBar`, for the same reason that one is
 * — these are promises about how the STORE operates, not merchandising. Making
 * them admin-editable would need a repeatable Q/A editor, and a store that can
 * type its own returns policy into a homepage block will eventually contradict
 * the policy checkout actually enforces. Every answer below is deliberately
 * free of specific numbers it cannot guarantee, and points at the page that
 * holds the real terms.
 */
interface Question {
  q: string;
  a: string;
  href?: string;
  hrefLabel?: string;
}

const QUESTIONS: Question[] = [
  {
    q: "How fast will my order arrive?",
    a: "Orders placed before the daily cut-off are dispatched within 24 hours, and you get a tracking link by email the moment the parcel is scanned. Delivery time after that depends on the service you pick at checkout.",
  },
  {
    q: "What if it is not right for me?",
    a: "You have 30 days to change your mind. Start a return from your account and we will confirm the address and the refund before you send anything back.",
    href: "/account/orders",
    hrefLabel: "Start a return",
  },
  {
    q: "Is everything covered by a warranty?",
    a: "Every device carries a two-year warranty on parts and labour, on top of the rights you already have by law. Keep your order confirmation — it is the only proof of purchase we need.",
  },
  {
    q: "Are the products genuine?",
    a: "We buy from the brands and their authorised distributors only. Nothing on this site is grey-market stock, refurbished-as-new, or a parallel import.",
  },
  {
    q: "Is checkout secure?",
    a: "Card details are handled entirely by Stripe and never touch our servers. We store your order, your address and nothing else about the payment beyond the last four digits.",
  },
  {
    q: "Can I talk to someone before I buy?",
    a: "Yes — specialists, seven days a week, and they will tell you when a cheaper product is the better one. Ask about compatibility before you order rather than after.",
  },
];

export async function FaqSection({
  id,
  eyebrow,
  title,
}: {
  id: string;
  eyebrow?: string;
  title?: string;
}) {
  // The support answer gets a mailto only when the store has actually published
  // an address. There is no /contact route to fall back on, and a question
  // headed "talk to someone" that links to a 404 is worse than one that just
  // says yes.
  const { contactEmail } = await getSettingsServer();
  const questions: Question[] = contactEmail
    ? QUESTIONS.map((item) =>
        item.q.startsWith("Can I talk")
          ? { ...item, href: `mailto:${contactEmail}`, hrefLabel: "Email us" }
          : item,
      )
    : QUESTIONS;

  return (
    <section aria-labelledby={id} className="space-y-5">
      <SectionHeading
        id={id}
        eyebrow={eyebrow}
        title={title ?? "Questions, answered"}
        icon={HelpCircle}
      />

      {/* Independent <details>, so several can be open at once. A single-open
       * accordion closes the answer a shopper was comparing against the one
       * they just clicked, which is exactly wrong here.
       *
       * The column count climbs with the viewport because the page is
       * full-bleed: two columns of answers on a 27" monitor is a 1200px line
       * length, which is roughly twice what anyone can comfortably read. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {questions.map(({ q, a, href, hrefLabel }) => (
          <details
            key={q}
            className="group border-border bg-card [&[open]]:border-primary/40 rounded-2xl border px-5 py-4"
          >
            <summary className="focus-visible:ring-ring flex cursor-pointer list-none items-center justify-between gap-4 font-semibold marker:content-none focus-visible:ring-2 focus-visible:outline-none">
              <span className="text-sm">{q}</span>
              {/* A plus that becomes a minus. Rotating a chevron needs an SVG;
               * this is two spans and reads the same at every size. */}
              <span
                className="bg-primary/10 text-primary relative grid h-6 w-6 shrink-0 place-items-center rounded-full transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              >
                <span className="absolute h-0.5 w-2.5 rounded-full bg-current" />
                <span className="absolute h-2.5 w-0.5 rounded-full bg-current transition-opacity duration-200 group-open:opacity-0" />
              </span>
            </summary>

            <div className="text-muted-foreground pt-3 text-sm leading-relaxed">
              <p>{a}</p>
              {href && hrefLabel && (
                <Link
                  href={href}
                  className="text-primary mt-3 inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
                >
                  {hrefLabel}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
