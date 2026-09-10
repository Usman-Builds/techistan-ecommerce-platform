"use client";

/**
 * Storefront notification hooks (script 16). Queries accept `enabled` so the bell
 * only fetches for signed-in shoppers (guests render nothing). The unread-count
 * badge polls; mutations invalidate both keys to keep badge + list in sync.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationQuery,
} from "../notifications";

export const NOTIFICATIONS_KEY = ["notifications"] as const;
export const UNREAD_COUNT_KEY = ["notifications", "unread-count"] as const;

export function useNotifications(query: NotificationQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [...NOTIFICATIONS_KEY, query],
    queryFn: () => listNotifications(query),
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: getUnreadCount,
    enabled,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });
      void qc.invalidateQueries({ queryKey: UNREAD_COUNT_KEY });
    },
  });
}
