"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { useCreateTag, useTags } from "@/lib/api/hooks/tags";
import { cn } from "@/lib/utils";

/**
 * Multi-select tags with inline create. Emits the selected tag ids; the product
 * form submits them as `tagIds` (the backend replaces the ProductTag join).
 */
export function TagSelector({
  value,
  onChange,
}: {
  value: string[];
  onChange: (tagIds: string[]) => void;
}) {
  const { data: tags } = useTags();
  const createTag = useCreateTag();
  const [draft, setDraft] = useState("");

  const selected = new Set(value);
  const toggle = (id: string) =>
    onChange(
      selected.has(id) ? value.filter((t) => t !== id) : [...value, id],
    );

  const create = async () => {
    const name = draft.trim();
    if (!name || createTag.isPending) return;
    try {
      const tag = await createTag.mutateAsync({ name });
      onChange([...value, tag.id]);
      setDraft("");
    } catch {
      /* surfaced by the mutation state; keep the draft */
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {(tags ?? []).map((tag) => {
          const isOn = selected.has(tag.id);
          return (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggle(tag.id)}
              aria-pressed={isOn}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                isOn
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              {tag.name}
              {isOn && <X className="h-3 w-3" aria-hidden />}
            </button>
          );
        })}
        {tags && tags.length === 0 && (
          <span className="text-xs text-muted-foreground">No tags yet.</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void create();
            }
          }}
          placeholder="New tag name"
          aria-label="New tag name"
          className="flex-1 rounded-md border border-input bg-background px-2.5 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={() => void create()}
          disabled={!draft.trim() || createTag.isPending}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Plus className="h-4 w-4" aria-hidden /> Add
        </button>
      </div>
    </div>
  );
}
