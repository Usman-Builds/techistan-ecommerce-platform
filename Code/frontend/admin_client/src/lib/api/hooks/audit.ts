"use client";

/** TanStack Query hook for the audit-log viewer (script 15, FR-808). */
import { useQuery } from "@tanstack/react-query";
import { listAuditLogs, type AuditQuery } from "../audit";

export const AUDIT_KEY = ["admin", "audit-logs"] as const;

export function useAuditLogs(query: AuditQuery) {
  return useQuery({
    queryKey: [...AUDIT_KEY, query],
    queryFn: () => listAuditLogs(query),
    placeholderData: (prev) => prev,
  });
}
