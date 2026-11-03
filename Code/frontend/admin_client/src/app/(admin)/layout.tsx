import { redirect } from "next/navigation";
import { getServerUser } from "@/lib/auth/server";
import { isAdminRole } from "@/lib/api/auth";
import { AdminShell } from "@/components/admin/AdminShell";
import { StoreCurrency } from "@/components/admin/StoreCurrency";
import { getServerStoreCurrency } from "@/lib/server/store-currency";

/**
 * Authoritative gate for the admin shell. `proxy.ts` already bounced cookie-less
 * requests; here we do the REAL server-side identity/role check via GET /auth/me
 * (NFR-208 — cookie contents are never trusted). A logged-out or non-admin user
 * (e.g. a CUSTOMER who somehow authenticated) is redirected to /login. The
 * backend RolesGuard remains the ultimate source of truth on every data call.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, currency] = await Promise.all([
    getServerUser(),
    getServerStoreCurrency(),
  ]);
  if (!user || !isAdminRole(user.role)) {
    redirect("/login");
  }

  // Money inputs and totals use the store currency's real minor units (#49).
  return (
    <StoreCurrency currency={currency}>
      <AdminShell user={user}>{children}</AdminShell>
    </StoreCurrency>
  );
}
