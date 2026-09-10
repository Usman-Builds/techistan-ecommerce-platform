"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

export function LogoutButton() {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <button
      type="button"
      onClick={async () => {
        await logout();
        router.push("/login");
        router.refresh();
      }}
      className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      Sign out
    </button>
  );
}
