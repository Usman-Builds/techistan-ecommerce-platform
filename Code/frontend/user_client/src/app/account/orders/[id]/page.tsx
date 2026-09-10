import type { Metadata } from "next";
import { OrderDetailView } from "@/components/account/OrderDetailView";

export const metadata: Metadata = {
  title: "Order detail — Techistan",
};

/**
 * Account order detail (script 11, FR-505). `OrderDetailView` reads the id from
 * the route via `useParams` and fetches through the credentialed apiClient, so the
 * backend enforces ownership. The /account layout guarantees a session.
 */
export default function OrderDetailPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OrderDetailView />
    </main>
  );
}
