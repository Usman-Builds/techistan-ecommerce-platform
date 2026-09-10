"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Admin error boundary (script 15, Task 14). Next 16.2 passes `unstable_retry`;
 * older/global variants pass `reset` — accept either so "Try again" always
 * re-renders the failed segment. Renders inside the AdminShell (layout is intact).
 */
export default function Error({
  error,
  reset,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  reset?: () => void;
  unstable_retry?: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const retry = unstable_retry ?? reset;

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <h1 className="font-heading text-xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        This screen failed to load. Please try again.
      </p>
      {retry && (
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Try again
        </button>
      )}
    </div>
  );
}
