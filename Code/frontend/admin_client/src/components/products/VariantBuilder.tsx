"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, X, AlertCircle } from "lucide-react";
import type { Variant, VariantInput } from "@/lib/api/products";
import { centsToDollars, dollarsToCents } from "@/lib/format";
import { cn } from "@/lib/utils";

const MAX_AXES = 3;
const MAX_VARIANTS = 100;

type Axis = { id: string; name: string; values: string[] };

type Cell = {
  price: string; // dollars
  compareAtPrice: string;
  stock: string;
  sku: string;
  enabled: boolean;
};

export type VariantBuilderResult = {
  axes: string[];
  variants: VariantInput[];
  valid: boolean;
};

type Props = {
  initialVariants?: Variant[];
  onChange: (result: VariantBuilderResult) => void;
};

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

/** Stable signature for a combination, in axis order. */
function signature(axes: Axis[], combo: Record<string, string>): string {
  return axes.map((a) => `${a.name}=${combo[a.name] ?? ""}`).join("|");
}

/** Cartesian product of the (named, non-empty) axes' values. */
function cartesian(axes: Axis[]): Record<string, string>[] {
  const active = axes.filter((a) => a.name.trim() && a.values.length > 0);
  if (active.length === 0) return [];
  let rows: Record<string, string>[] = [{}];
  for (const axis of active) {
    const next: Record<string, string>[] = [];
    for (const row of rows) {
      for (const value of axis.values) {
        next.push({ ...row, [axis.name]: value });
      }
    }
    rows = next;
  }
  return rows;
}

function deriveInitial(variants: Variant[]): {
  axes: Axis[];
  cells: Record<string, Cell>;
} {
  const axisNames: string[] = [];
  const valuesByAxis = new Map<string, string[]>();
  for (const v of variants) {
    for (const [key, value] of Object.entries(v.options ?? {})) {
      if (!valuesByAxis.has(key)) {
        valuesByAxis.set(key, []);
        axisNames.push(key);
      }
      const bucket = valuesByAxis.get(key)!;
      if (!bucket.includes(value)) bucket.push(value);
    }
  }
  const axes: Axis[] = axisNames.map((name) => ({
    id: uid(),
    name,
    values: valuesByAxis.get(name) ?? [],
  }));
  const cells: Record<string, Cell> = {};
  for (const v of variants) {
    const sig = signature(axes, v.options ?? {});
    cells[sig] = {
      price: centsToDollars(v.price),
      compareAtPrice: centsToDollars(v.compareAtPrice),
      stock: String(v.stock ?? 0),
      sku: v.sku ?? "",
      enabled: true,
    };
  }
  return { axes, cells };
}

const emptyCell = (): Cell => ({
  price: "",
  compareAtPrice: "",
  stock: "0",
  sku: "",
  enabled: true,
});

export function VariantBuilder({ initialVariants = [], onChange }: Props) {
  const seed = useMemo(
    () => deriveInitial(initialVariants),
    // Seed once from the initial variants; subsequent edits are local.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [axes, setAxes] = useState<Axis[]>(seed.axes);
  const [cells, setCells] = useState<Record<string, Cell>>(seed.cells);
  const [valueDraft, setValueDraft] = useState<Record<string, string>>({});

  const combos = useMemo(() => cartesian(axes), [axes]);
  const hasAxes = axes.some((a) => a.name.trim() && a.values.length > 0);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Emit the current result whenever axes/cells change.
  useEffect(() => {
    const axisNames = axes
      .filter((a) => a.name.trim() && a.values.length > 0)
      .map((a) => a.name.trim());

    let variants: VariantInput[];
    let valid = true;

    if (!hasAxes) {
      // Single default variant. An empty price means "no variant yet" (a valid
      // draft state), not an error.
      const c = cells["__default__"] ?? emptyCell();
      if (c.price.trim() === "") {
        variants = [];
      } else {
        const cents = dollarsToCents(c.price);
        valid = cents != null && !Number.isNaN(cents);
        variants = valid
          ? [
              {
                price: cents!,
                compareAtPrice: toCents(c.compareAtPrice),
                stock: toInt(c.stock),
                sku: c.sku.trim() || undefined,
                options: {},
              },
            ]
          : [];
      }
    } else {
      variants = [];
      for (const combo of combos) {
        const sig = signature(axes, combo);
        const c = cells[sig] ?? emptyCell();
        if (!c.enabled) continue;
        const cents = dollarsToCents(c.price);
        if (cents == null || Number.isNaN(cents)) {
          valid = false;
          continue;
        }
        variants.push({
          price: cents,
          compareAtPrice: toCents(c.compareAtPrice),
          stock: toInt(c.stock),
          sku: c.sku.trim() || undefined,
          options: combo,
        });
      }
      if (variants.length === 0) valid = false;
    }

    if (axisNames.length > MAX_AXES || variants.length > MAX_VARIANTS) {
      valid = false;
    }

    onChangeRef.current({ axes: axisNames, variants, valid });
  }, [axes, cells, combos, hasAxes]);

  // ── axis mutations ──
  const addAxis = () => {
    if (axes.length >= MAX_AXES) return;
    setAxes((prev) => [...prev, { id: uid(), name: "", values: [] }]);
  };
  const removeAxis = (id: string) =>
    setAxes((prev) => prev.filter((a) => a.id !== id));
  const renameAxis = (id: string, name: string) =>
    setAxes((prev) => prev.map((a) => (a.id === id ? { ...a, name } : a)));
  const addValue = (id: string) => {
    const draft = (valueDraft[id] ?? "").trim();
    if (!draft) return;
    setAxes((prev) =>
      prev.map((a) =>
        a.id === id && !a.values.includes(draft)
          ? { ...a, values: [...a.values, draft] }
          : a,
      ),
    );
    setValueDraft((prev) => ({ ...prev, [id]: "" }));
  };
  const removeValue = (id: string, value: string) =>
    setAxes((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, values: a.values.filter((v) => v !== value) }
          : a,
      ),
    );

  const patchCell = (sig: string, patch: Partial<Cell>) =>
    setCells((prev) => ({
      ...prev,
      [sig]: { ...(prev[sig] ?? emptyCell()), ...patch },
    }));

  const overLimit = combos.length > MAX_VARIANTS;
  const axisOver = axes.filter((a) => a.name.trim()).length > MAX_AXES;

  return (
    <div className="space-y-5">
      {/* Axis editors */}
      <div className="space-y-3">
        {axes.map((axis) => (
          <div
            key={axis.id}
            className="rounded-lg border border-border bg-background p-3"
          >
            <div className="flex items-center gap-2">
              <input
                value={axis.name}
                onChange={(e) => renameAxis(axis.id, e.target.value)}
                placeholder="Axis name (e.g. Size)"
                aria-label="Axis name"
                className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="button"
                onClick={() => removeAxis(axis.id)}
                aria-label="Remove axis"
                className="rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive"
              >
                <X className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {axis.values.map((value) => (
                <span
                  key={value}
                  className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs"
                >
                  {value}
                  <button
                    type="button"
                    onClick={() => removeValue(axis.id, value)}
                    aria-label={`Remove ${value}`}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                </span>
              ))}
              <input
                value={valueDraft[axis.id] ?? ""}
                onChange={(e) =>
                  setValueDraft((prev) => ({
                    ...prev,
                    [axis.id]: e.target.value,
                  }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addValue(axis.id);
                  }
                }}
                placeholder="Add value + Enter"
                aria-label="Add axis value"
                className="min-w-[9rem] flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>
        ))}

        {axes.length < MAX_AXES && (
          <button
            type="button"
            onClick={addAxis}
            className="inline-flex items-center gap-1.5 rounded-md border border-dashed border-input px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
          >
            <Plus className="h-4 w-4" aria-hidden /> Add option axis
          </button>
        )}
      </div>

      {(overLimit || axisOver) && (
        <p
          className="flex items-center gap-1.5 text-xs text-destructive"
          role="alert"
        >
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          {axisOver
            ? `At most ${MAX_AXES} axes are allowed.`
            : `${combos.length} combinations exceed the limit of ${MAX_VARIANTS}. Remove some values.`}
        </p>
      )}

      {/* Matrix grid */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th className="py-2 pr-3 font-medium">Variant</th>
              <th className="py-2 pr-3 font-medium">Price ($)</th>
              <th className="py-2 pr-3 font-medium">Compare-at ($)</th>
              <th className="py-2 pr-3 font-medium">Stock</th>
              <th className="py-2 pr-3 font-medium">SKU (optional)</th>
              <th className="py-2 font-medium">On</th>
            </tr>
          </thead>
          <tbody>
            {!hasAxes ? (
              <VariantRow
                label="Default"
                cell={cells["__default__"] ?? emptyCell()}
                onPatch={(patch) => patchCell("__default__", patch)}
                toggleable={false}
              />
            ) : (
              combos.slice(0, MAX_VARIANTS + 1).map((combo) => {
                const sig = signature(axes, combo);
                return (
                  <VariantRow
                    key={sig}
                    label={Object.values(combo).join(" / ")}
                    cell={cells[sig] ?? emptyCell()}
                    onPatch={(patch) => patchCell(sig, patch)}
                    toggleable
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {hasAxes
          ? `${combos.length} combination${combos.length === 1 ? "" : "s"} · max ${MAX_VARIANTS}`
          : "No axes defined — this product has a single default variant."}
      </p>
    </div>
  );
}

function VariantRow({
  label,
  cell,
  onPatch,
  toggleable,
}: {
  label: string;
  cell: Cell;
  onPatch: (patch: Partial<Cell>) => void;
  toggleable: boolean;
}) {
  const inputCls =
    "w-full rounded border border-input bg-background px-2 py-1 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";
  const disabled = toggleable && !cell.enabled;
  return (
    <tr className={cn("border-b border-border", disabled && "opacity-50")}>
      <td className="py-1.5 pr-3 font-medium">{label || "—"}</td>
      <td className="py-1.5 pr-3">
        <input
          inputMode="decimal"
          value={cell.price}
          disabled={disabled}
          onChange={(e) => onPatch({ price: e.target.value })}
          placeholder="0.00"
          aria-label={`Price for ${label}`}
          className={inputCls}
        />
      </td>
      <td className="py-1.5 pr-3">
        <input
          inputMode="decimal"
          value={cell.compareAtPrice}
          disabled={disabled}
          onChange={(e) => onPatch({ compareAtPrice: e.target.value })}
          placeholder="—"
          aria-label={`Compare-at price for ${label}`}
          className={inputCls}
        />
      </td>
      <td className="py-1.5 pr-3">
        <input
          inputMode="numeric"
          value={cell.stock}
          disabled={disabled}
          onChange={(e) => onPatch({ stock: e.target.value })}
          aria-label={`Stock for ${label}`}
          className={inputCls}
        />
      </td>
      <td className="py-1.5 pr-3">
        <input
          value={cell.sku}
          disabled={disabled}
          onChange={(e) => onPatch({ sku: e.target.value })}
          placeholder="auto"
          aria-label={`SKU for ${label}`}
          className={inputCls}
        />
      </td>
      <td className="py-1.5">
        {toggleable ? (
          <input
            type="checkbox"
            checked={cell.enabled}
            onChange={(e) => onPatch({ enabled: e.target.checked })}
            aria-label={`Enable ${label}`}
            className="h-4 w-4 accent-[var(--color-primary,currentColor)]"
          />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
    </tr>
  );
}

function toCents(dollars: string): number | undefined {
  const cents = dollarsToCents(dollars);
  return cents == null || Number.isNaN(cents) ? undefined : cents;
}
function toInt(value: string): number {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
