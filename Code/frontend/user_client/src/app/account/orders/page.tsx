import type { Metadata } from "next";
import { OrderHistoryView } from "@/components/account/OrderHistoryView";

export const metadata: Metadata = {
  title: "Your orders — Techistan",
};

/**
 * Account order history (script 11, FR-505). The /account layout already enforces
 * the session server-side; this renders the client-side, filterable list.
 */
export default function OrdersPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <OrderHistoryView />
    </main>
  );
}
