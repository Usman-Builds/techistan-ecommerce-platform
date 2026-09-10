import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "@/lib/api/client";
import type { User } from "@/lib/api/auth";

/**
 * Server-side session resolution. Forwards the incoming request cookies to the
 * backend `GET /auth/me`, which is the authoritative identity/role source
 * (NFR-208 — never trust cookie contents client-side). Returns null when the
 * caller is not authenticated.
 */
export async function getServerUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();
  if (!cookieHeader) return null;

  try {
    const res = await fetch(`${API_URL}/auth/me`, {
      headers: { cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}
