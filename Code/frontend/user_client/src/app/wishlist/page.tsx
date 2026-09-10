import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server";
import { WishlistView } from "@/components/storefront/WishlistView";

export const metadata: Metadata = {
  title: "Wishlist — Techistan",
  description: "Your saved Techistan products.",
};

/**
 * Customer wishlist page (script 09, FR-307). `proxy.ts` bounces cookie-less
 * requests; here we do the authoritative server-side identity check (the backend
 * routes are also RBAC-guarded to CUSTOMER).
 */
export default async function WishlistPage() {
  const user = await getServerUser();
  if (!user) redirect("/login?next=/wishlist");

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="mb-6 font-heading text-2xl font-bold">My wishlist</h1>
      <WishlistView />
    </main>
  );
}
