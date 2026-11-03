import "server-only";
import { BACKEND_URL } from "@/lib/api/client";
import { backendForwardHeaders } from "@/lib/server/backend-headers";

/**
 * The store currency from the public `GET /settings` (#49). The admin money
 * helpers need it to know how many minor units a price has. Falls back to USD
 * if the API is unreachable, which is the previous behaviour.
 */
export async function getServerStoreCurrency(): Promise<string> {
  try {
    const res = await fetch(`${BACKEND_URL}/settings`, {
      headers: await backendForwardHeaders(),
      cache: "no-store",
    });
    if (!res.ok) return "USD";
    const body = (await res.json()) as { currency?: string };
    return body.currency || "USD";
  } catch {
    return "USD";
  }
}
