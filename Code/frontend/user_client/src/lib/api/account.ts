/**
 * Self-service GDPR API (script 17). Thin wrappers over the JWT-guarded backend
 * `/account/*` endpoints — the storefront only renders the request UI; all
 * export/deletion logic lives in NestJS.
 */
import { apiClient } from "./client";

export type DeletionResponse = {
  deletionScheduledAt: string;
  alreadyScheduled: boolean;
};

/** Fetch the caller's full personal-data export (Right to Access). */
export function fetchDataExport(): Promise<unknown> {
  return apiClient.get<unknown>("/account/data-export");
}

/** Schedule account deletion with a 30-day grace window (Right to Erasure). */
export function requestAccountDeletion(): Promise<DeletionResponse> {
  return apiClient.delete<DeletionResponse>("/account");
}

/** Cancel a pending deletion while still inside the grace window. */
export function cancelAccountDeletion(): Promise<{ cancelled: boolean }> {
  return apiClient.post<{ cancelled: boolean }>("/account/cancel-deletion");
}

/**
 * Turn the export object into a downloadable JSON file in the browser. Kept in
 * the API layer so the page component stays declarative. Uses a Blob + object
 * URL so the download carries the authenticated apiClient response (cookies +
 * silent refresh) rather than a raw cross-origin link.
 */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
