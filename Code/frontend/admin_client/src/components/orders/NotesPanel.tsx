"use client";

import { useState } from "react";
import { Loader2, StickyNote } from "lucide-react";
import type { NoteVisibility, OrderNote } from "@/lib/api/orders";
import { useAddNote } from "@/lib/api/hooks/orders";

/**
 * Order notes (FR-507). Admins add INTERNAL (staff-only) or CUSTOMER (shown on the
 * customer order page) notes. Existing notes are listed newest-first.
 */
export function NotesPanel({
  orderId,
  notes,
}: {
  orderId: string;
  notes: OrderNote[];
}) {
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState<NoteVisibility>("INTERNAL");
  const mutation = useAddNote(orderId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    await mutation.mutateAsync({ body: body.trim(), visibility });
    setBody("");
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-semibold">
        <StickyNote className="h-4 w-4" aria-hidden /> Notes
      </h2>

      {notes.length > 0 && (
        <ul className="mt-3 space-y-3 text-sm">
          {notes.map((n) => (
            <li key={n.id} className="rounded-md border border-border p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span
                  className={
                    n.visibility === "CUSTOMER"
                      ? "rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-success"
                      : "rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground"
                  }
                >
                  {n.visibility}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString("en-US")}
                </span>
              </div>
              <p className="whitespace-pre-wrap">{n.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder="Add a note…"
          aria-label="Note body"
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex items-center gap-2">
          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as NoteVisibility)}
            aria-label="Note visibility"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="INTERNAL">Internal</option>
            <option value="CUSTOMER">Customer-visible</option>
          </select>
          <button
            type="submit"
            disabled={!body.trim() || mutation.isPending}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {mutation.isPending && (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            )}
            Add note
          </button>
        </div>
      </form>
    </div>
  );
}
