import { Suspense } from "react";
import type { Metadata } from "next";
import { Loader2 } from "lucide-react";
import { ConfirmationView } from "@/components/checkout/ConfirmationView";

export const metadata: Metadata = {
  title: "Order confirmation — Techistan",
};

/**
 * Order confirmation route. `ConfirmationView` uses `useSearchParams`, which
 * Next 16 requires to be wrapped in <Suspense>.
 */
export default function ConfirmationPage() {
  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <Suspense
        fallback={
          <div className="flex justify-center py-24 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
          </div>
        }
      >
        <ConfirmationView />
      </Suspense>
    </main>
  );
}
