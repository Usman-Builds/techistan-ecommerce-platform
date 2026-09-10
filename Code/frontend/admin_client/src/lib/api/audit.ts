/**
 * Admin audit-log API (script 15, FR-808). Read-only viewer over every recorded
 * admin mutation. `@AdminOnly()` server-side.
 */
import { apiClient } from "./client";

export interface AuditActor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: number | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: string;
  actor: AuditActor | null;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AuditQuery {
  actorId?: number;
  action?: string;
  entityType?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listAuditLogs(query: AuditQuery = {}): Promise<AuditLogResponse> {
  return apiClient.get<AuditLogResponse>(
    `/admin/audit-logs${toQuery(query as Record<string, unknown>)}`,
  );
}
