"use client";

import { useState } from "react";
import { Mail, Check } from "lucide-react";
import { z } from "zod";
import { cn } from "@/lib/utils";

/**
 * Newsletter capture (script 14). The transactional/marketing email backend
 * (Resend) lands in script 16 — until then this validates the address and
 * confirms locally so the UI is complete. Swapping in a real `POST /newsletter`
 * is a one-line change here.
 *
 * TONE exists because this form appears on two very different grounds: the
 * footer's ordinary page background, and the homepage's solid GOLD newsletter
 * panel. The gold panel sets `text-primary-foreground` (near-black) on
 * everything inside it, and this form used to inherit that — which put
 * near-black text inside a pitch-black input, and a gold Subscribe button on a
 * gold panel. Both were invisible.
 *
 * The fix is that nothing here inherits a colour any more. Every element states
 * its own foreground, so a caller cannot break the form by setting a text
 * colour on an ancestor; `tone` only picks which of the two dressings to use.
 */
const emailSchema = z.email();

export type NewsletterTone = "surface" | "brand";

export function NewsletterSignup({
  tone = "surface",
}: {
  /** `brand` = sitting on the solid gold panel. `surface` = ordinary page. */
  tone?: NewsletterTone;
}) {
  const [email, setEmail] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBrand = tone === "brand";

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError("Please enter a valid email address.");
      return;
    }
    setError(null);
    // TODO(script 16): POST to the notifications/newsletter endpoint.
    setDone(true);
  };

  if (done) {
    return (
      <p
        className={cn(
          "inline-flex items-center gap-2 text-sm font-medium",
          // Green on gold is muddy and fails contrast; on the brand panel the
          // tick plus the words carry the meaning instead.
          onBrand ? "text-primary-foreground" : "text-success",
        )}
      >
        <Check className="h-4 w-4" aria-hidden />
        Thanks — you&apos;re on the list.
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-2" noValidate>
      <label
        htmlFor="newsletter-email"
        className={cn(
          "block text-sm font-medium",
          onBrand ? "text-primary-foreground" : "text-foreground",
        )}
      >
        Get the latest drops &amp; deals
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Mail
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2"
            aria-hidden
          />
          <input
            id="newsletter-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            aria-invalid={Boolean(error)}
            // `text-foreground` is stated rather than inherited — that is the
            // whole bug fix. The field is dark on both grounds, so what the
            // shopper types is white in both.
            className={cn(
              "text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full rounded-md border py-2 pr-3 pl-9 text-sm outline-none focus-visible:ring-2",
              onBrand
                ? "bg-background focus-visible:ring-offset-primary border-transparent focus-visible:ring-offset-1"
                : "bg-background border-input",
            )}
          />
        </div>
        <button
          type="submit"
          className={cn(
            "shrink-0 rounded-md px-4 py-2 text-sm font-semibold transition-opacity hover:opacity-90",
            // On gold, a gold button is no button. It goes near-black with the
            // brand hue as its label, which also ties it to the dark field
            // beside it.
            onBrand
              ? "bg-background text-primary"
              : "bg-primary text-primary-foreground",
          )}
        >
          Subscribe
        </button>
      </div>
      {error && (
        <p
          className={cn(
            "text-xs font-medium",
            onBrand ? "text-primary-foreground" : "text-destructive",
          )}
          role="alert"
        >
          {error}
        </p>
      )}
    </form>
  );
}
