/**
 * Storefront notification API (script 16, FR-904). JWT-scoped server-side to the
 * signed-in shopper (NFR-208) — order updates, shipping, refunds, promotions.
 * Same REST surface the admin panel uses; the JWT decides the rows. All calls go
 * through apiClient (credentials: "include") — never direct DB access.
 */
import { apiClient } from "./client";

export interface NotificationItem {
  id: string;
  userId: number;
  type: string;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  page: number;
  pageSize: number;
  total: number;
  unreadCount: number;
}

export interface NotificationQuery {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
}

function toQuery(params: NotificationQuery): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const listNotifications = (query: NotificationQuery = {}) =>
  apiClient.get<NotificationListResponse>(`/notifications${toQuery(query)}`);

export const getUnreadCount = () =>
  apiClient.get<{ count: number }>("/notifications/unread-count");

export const markNotificationRead = (id: string) =>
  apiClient.patch<{ success: true }>(`/notifications/${id}/read`);

export const markAllNotificationsRead = () =>
  apiClient.patch<{ updated: number }>("/notifications/read-all");

/** Deep-link an order notification to the shopper's order detail. */
export function notificationHref(n: NotificationItem): string | null {
  const data = n.data ?? {};
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  switch (n.type) {
    case "ORDER_CONFIRMED":
    case "ORDER_SHIPPED":
    case "ORDER_STATUS":
    case "ORDER_REFUNDED":
    case "ORDER_RETURN":
      return orderId ? `/account/orders/${orderId}` : "/account/orders";
    default:
      return null;
  }
}
