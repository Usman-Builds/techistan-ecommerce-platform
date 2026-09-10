"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

/**
 * Root error boundary (script 14, NFR-304). Next 16.2 passes `unstable_retry`;
 * older/global variants pass `reset` — accept either so "Try again" always
 * re-renders the failed segment.
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
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-24 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" aria-hidden />
      <h1 className="font-heading text-2xl font-bold">Something went wrong</h1>
      <p className="text-sm text-muted-foreground">
        We hit a snag loading this page. Please try again.
      </p>
      {retry && (
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Try again
        </button>
      )}
    </div>
  );
}
