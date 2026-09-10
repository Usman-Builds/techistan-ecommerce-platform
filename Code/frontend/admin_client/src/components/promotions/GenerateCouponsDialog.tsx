"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Check, Copy, Download, Loader2, Wand2, X } from "lucide-react";
import type {
  CouponType,
  GenerateCouponsInput,
  GenerateCouponsResult,
} from "@/lib/api/promotions";
import { useGenerateCoupons } from "@/lib/api/hooks/promotions";
import { ApiError } from "@/lib/api/client";
import { Select } from "@/components/ui/Select";
import { Field, Input, Toggle } from "@/components/ui/Form";
import {
  EMPTY_SCOPE,
  PromotionScopeFields,
  scopeIsIncomplete,
  scopeToInput,
  type ScopeState,
} from "./PromotionScopeFields";
import { dollarsToCents } from "@/lib/format";

const MAX_COUNT = 500;

/**
 * Mint a batch of unique single-use codes.
 *
 * A win-back email, an influencer drop or a support gesture all need N distinct
 * codes sharing one set of rules — which the single-coupon form cannot express
 * at any reasonable effort. Every code in a run shares a `batchId`, so the whole
 * batch can be filtered, disabled or deleted afterwards as one thing.
 *
 * The generated codes are shown ONCE, on success, with copy and CSV download.
 * They exist in the coupon list afterwards, but a merchant's actual next step is
 * to paste them into an email tool, so the dialog hands them over directly.
 *
 * The caller REMOUNTS this component each time it opens (via a changing `key`),
 * which is why there is no reset logic here: a fresh mount is already a fresh
 * form, and leaving the previous run's codes on screen would make it unclear
 * whether the next press generated anything.
 */
export function GenerateCouponsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const generate = useGenerateCoupons();
  const reduce = useReducedMotion();
  const firstFieldRef = useRef<HTMLInputElement>(null);

  const [count, setCount] = useState("25");
  const [prefix, setPrefix] = useState("");
  const [suffixLength, setSuffixLength] = useState("8");
  const [name, setName] = useState("");
  const [type, setType] = useState<CouponType>("PERCENT");
  const [value, setValue] = useState("10");
  const [minOrder, setMinOrder] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [singleUse, setSingleUse] = useState(true);
  const [scope, setScope] = useState<ScopeState>(EMPTY_SCOPE);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateCouponsResult | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !generate.isPending) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    queueMicrotask(() => firstFieldRef.current?.focus());
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, generate.isPending, onClose]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const n = parseInt(count, 10);
    if (!Number.isFinite(n) || n < 1 || n > MAX_COUNT) {
      setError(`Choose between 1 and ${MAX_COUNT} codes.`);
      return;
    }
    if (scopeIsIncomplete(scope)) {
      setError("Pick the categories or products this batch applies to.");
      return;
    }

    const numericValue =
      type === "FIXED"
        ? dollarsToCents(value)
        : type === "PERCENT"
          ? parseInt(value, 10)
          : 0;
    if (
      type !== "FREE_SHIPPING" &&
      (numericValue == null || Number.isNaN(numericValue) || numericValue <= 0)
    ) {
      setError("Enter a discount greater than zero.");
      return;
    }
    if (type === "PERCENT" && (numericValue as number) > 100) {
      setError("Percentage must be between 1 and 100.");
      return;
    }

    const input: GenerateCouponsInput = {
      count: n,
      prefix: prefix.trim().toUpperCase() || undefined,
      suffixLength: parseInt(suffixLength, 10) || 8,
      name: name.trim() || null,
      type,
      value: (numericValue as number) ?? 0,
      minOrder: minOrder.trim() ? dollarsToCents(minOrder) : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      // The default for a generated batch: one use overall, one per customer.
      // Turning it off makes them shared codes that happen to have been minted
      // together, which is occasionally what a print campaign wants.
      usageLimit: singleUse ? 1 : null,
      perCustomerLimit: singleUse ? 1 : null,
      active: true,
      ...scopeToInput(scope),
    };

    try {
      setResult(await generate.mutateAsync(input));
    } catch (err) {
      setError(
        err instanceof ApiError ? err.message : "Could not generate codes.",
      );
    }
  };

  const codes = result?.coupons.map((c) => c.code) ?? [];

  const copyAll = async () => {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadCsv = () => {
    const csv = ["code", ...codes].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `coupons-${result?.batchId ?? "batch"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 py-10">
          <motion.div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => !generate.isPending && onClose()}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.15 }}
            aria-hidden
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="generate-title"
            className="relative z-10 w-full max-w-2xl rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-xl"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.97, y: reduce ? 0 : 8 }}
            transition={{ duration: reduce ? 0 : 0.18 }}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="generate-title"
                  className="flex items-center gap-2 font-heading text-lg font-bold"
                >
                  <Wand2 className="h-5 w-5 text-primary" aria-hidden />
                  Generate coupon codes
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Unique codes that all share one set of rules.
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>

            {result ? (
              <div className="space-y-4">
                <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
                  Generated {result.count} code
                  {result.count === 1 ? "" : "s"}. Copy them now — they are also
                  in the coupon list, filed under this batch.
                </p>

                <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-background p-3">
                  <ul className="grid grid-cols-2 gap-1 font-mono text-xs sm:grid-cols-3">
                    {codes.map((code) => (
                      <li key={code} className="truncate">
                        {code}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={copyAll}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-success" aria-hidden />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden />
                    )}
                    {copied ? "Copied" : "Copy all"}
                  </button>
                  <button
                    type="button"
                    onClick={downloadCsv}
                    className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <Download className="h-4 w-4" aria-hidden />
                    Download CSV
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="ml-auto rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="How many" htmlFor="gen-count" required>
                    <Input
                      ref={firstFieldRef}
                      id="gen-count"
                      type="number"
                      min={1}
                      max={MAX_COUNT}
                      value={count}
                      onChange={(e) => setCount(e.target.value)}
                    />
                  </Field>
                  <Field
                    label="Prefix"
                    htmlFor="gen-prefix"
                    hint="Optional, e.g. WELCOME."
                  >
                    <Input
                      id="gen-prefix"
                      value={prefix}
                      onChange={(e) => setPrefix(e.target.value.toUpperCase())}
                      placeholder="WELCOME"
                      className="font-mono uppercase"
                    />
                  </Field>
                  <Field
                    label="Random length"
                    htmlFor="gen-length"
                    hint="6–12 characters."
                  >
                    <Input
                      id="gen-length"
                      type="number"
                      min={6}
                      max={12}
                      value={suffixLength}
                      onChange={(e) => setSuffixLength(e.target.value)}
                    />
                  </Field>
                </div>

                <p className="rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground">
                  Example:{" "}
                  {prefix.trim() ? `${prefix.trim().toUpperCase()}-` : ""}
                  {"K7M2QX4P".slice(0, parseInt(suffixLength, 10) || 8)}
                </p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label="Batch name"
                    htmlFor="gen-name"
                    hint="For your own reference."
                  >
                    <Input
                      id="gen-name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Win-back campaign, March"
                    />
                  </Field>

                  <Field label="Discount type">
                    <Select<CouponType>
                      label="Discount type"
                      value={type}
                      onChange={setType}
                      options={[
                        { value: "PERCENT", label: "Percentage off" },
                        { value: "FIXED", label: "Fixed amount off" },
                        { value: "FREE_SHIPPING", label: "Free shipping" },
                      ]}
                    />
                  </Field>

                  {type !== "FREE_SHIPPING" && (
                    <Field
                      label={type === "PERCENT" ? "Percentage" : "Amount"}
                      htmlFor="gen-value"
                      required
                    >
                      <Input
                        id="gen-value"
                        value={value}
                        onChange={(e) => setValue(e.target.value)}
                        inputMode="decimal"
                        placeholder={type === "PERCENT" ? "10" : "5.00"}
                      />
                    </Field>
                  )}

                  <Field label="Minimum order" htmlFor="gen-min">
                    <Input
                      id="gen-min"
                      value={minOrder}
                      onChange={(e) => setMinOrder(e.target.value)}
                      inputMode="decimal"
                      placeholder="No minimum"
                    />
                  </Field>

                  <Field label="Expires" htmlFor="gen-expires">
                    <Input
                      id="gen-expires"
                      type="datetime-local"
                      value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                    />
                  </Field>
                </div>

                <Toggle
                  label="Single use per code"
                  description="One redemption overall and one per customer — the usual shape for a generated batch."
                  checked={singleUse}
                  onChange={setSingleUse}
                />

                <div className="border-t border-border pt-4">
                  <PromotionScopeFields
                    state={scope}
                    onChange={setScope}
                    subject="batch"
                  />
                </div>

                {error && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}

                <div className="flex justify-end gap-2 border-t border-border pt-4">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={generate.isPending}
                    className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
                  >
                    {generate.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Wand2 className="h-4 w-4" aria-hidden />
                    )}
                    Generate {count || "0"} codes
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
