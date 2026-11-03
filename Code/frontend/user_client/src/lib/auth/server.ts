import "server-only";
import { cookies } from "next/headers";
import { BACKEND_URL } from "@/lib/api/client";
import { backendForwardHeaders } from "@/lib/server/backend-headers";
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

  const forward = await backendForwardHeaders();
  try {
    const res = await fetch(`${BACKEND_URL}/auth/me`, {
      headers: { ...forward, cookie: cookieHeader },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as User;
  } catch {
    return null;
  }
}
