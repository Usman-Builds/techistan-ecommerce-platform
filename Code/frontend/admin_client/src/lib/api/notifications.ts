/**
 * In-app notification API (script 16, FR-904). JWT-scoped server-side to the
 * caller (NFR-208) — the admin JWT surfaces admin alerts (new order / low stock /
 * new review) plus any order notifications the admin account itself owns. Same
 * REST surface the storefront consumes; identity decides the rows.
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

function toQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "" && v !== false) q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listNotifications(
  query: NotificationQuery = {},
): Promise<NotificationListResponse> {
  return apiClient.get<NotificationListResponse>(
    `/notifications${toQuery(query as Record<string, unknown>)}`,
  );
}

export function getUnreadCount(): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>("/notifications/unread-count");
}

export function markNotificationRead(id: string): Promise<{ success: true }> {
  return apiClient.patch<{ success: true }>(`/notifications/${id}/read`);
}

export function markAllNotificationsRead(): Promise<{ updated: number }> {
  return apiClient.patch<{ updated: number }>("/notifications/read-all");
}

/** Deep-link an admin alert to its target screen (best-effort, by type + data). */
export function notificationHref(n: NotificationItem): string | null {
  const data = n.data ?? {};
  const orderId = typeof data.orderId === "string" ? data.orderId : null;
  const productId = typeof data.productId === "string" ? data.productId : null;
  switch (n.type) {
    case "ADMIN_NEW_ORDER":
      return orderId ? `/orders/${orderId}` : "/orders";
    case "ADMIN_LOW_STOCK":
      return "/inventory";
    case "ADMIN_NEW_REVIEW":
      return "/reviews";
    case "ORDER_CONFIRMED":
    case "ORDER_SHIPPED":
    case "ORDER_STATUS":
    case "ORDER_REFUNDED":
    case "ORDER_RETURN":
      return orderId ? `/orders/${orderId}` : productId ? `/products/${productId}` : null;
    default:
      return null;
  }
}
