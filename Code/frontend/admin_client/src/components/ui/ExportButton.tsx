"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Streamed CSV download button (script 15, FR-809). The export is a top-level GET
 * so the browser handles the stream as a file download and the httpOnly auth
 * cookie is sent automatically — we never buffer the CSV in JS. A short busy
 * state gives feedback while the download is dispatched.
 */
export function ExportButton({
  url,
  label = "Export CSV",
  className,
}: {
  url: string;
  label?: string;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = () => {
    setBusy(true);
    // A hidden anchor click triggers the browser's native download of the stream.
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // The request is dispatched to the browser; clear the busy hint shortly after.
    window.setTimeout(() => setBusy(false), 1200);
  };

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      ) : (
        <Download className="h-4 w-4" aria-hidden />
      )}
      {label}
    </button>
  );
}
