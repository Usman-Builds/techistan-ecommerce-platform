import Link from "next/link";
import { Package, Bell, ShieldCheck } from "lucide-react";
import { getServerUser } from "@/lib/auth/server";
import { LogoutButton } from "@/components/auth/LogoutButton";

export default async function AccountPage() {
  // The layout already guaranteed a session; fetch again for the display data.
  const user = await getServerUser();

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl font-bold">My account</h1>
        <LogoutButton />
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2">
        <Link
          href="/account/orders"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
        >
          <Package className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Your orders</p>
            <p className="text-sm text-muted-foreground">
              Track shipments, download invoices, and request returns.
            </p>
          </div>
        </Link>

        <Link
          href="/account/notifications"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
        >
          <Bell className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Notifications</p>
            <p className="text-sm text-muted-foreground">
              Order updates, shipping alerts, and promotions.
            </p>
          </div>
        </Link>

        <Link
          href="/account/settings"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/50"
        >
          <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
          <div>
            <p className="font-medium">Privacy &amp; data</p>
            <p className="text-sm text-muted-foreground">
              Export your data or delete your account.
            </p>
          </div>
        </Link>
      </div>

      <dl className="mt-8 divide-y divide-border rounded-lg border border-border">
        <Row label="Name" value={`${user?.firstName} ${user?.lastName}`} />
        <Row label="Email" value={user?.email ?? ""} />
        <Row
          label="Email verified"
          value={user?.emailVerified ? "Yes" : "No"}
        />
        <Row label="Sign-in method" value={user?.provider ?? ""} />
        <Row label="Role" value={user?.role ?? ""} />
      </dl>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between px-4 py-3">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
    </div>
  );
}
