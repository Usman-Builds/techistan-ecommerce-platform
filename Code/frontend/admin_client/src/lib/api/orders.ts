/**
 * Admin order-management API bindings (script 11). Every call hits the
 * `@AdminOnly()`-guarded `/admin/orders` routes through the credentialed
 * `apiClient` — RBAC is enforced server-side (NFR-208). Money is integer cents.
 */
import { apiClient, API_BASE } from "./client";

export type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "COMPLETED"
  | "CANCELLED"
  | "REFUNDED";

export type PaymentStatus =
  | "REQUIRES_PAYMENT"
  | "PROCESSING"
  | "SUCCEEDED"
  | "FAILED"
  | "REFUNDED"
  | "PARTIALLY_REFUNDED";

export type NoteVisibility = "INTERNAL" | "CUSTOMER";
export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";
export type Carrier = "UPS" | "USPS" | "FEDEX" | "DHL" | "OTHER";

export interface OrderAddress {
  fullName: string;
  phone?: string;
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface OrderItem {
  id: string;
  productTitle: string;
  variantOptions: Record<string, string>;
  sku: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ShipmentEvent {
  id: string;
  status: string;
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  note: string | null;
  occurredAt: string;
}

export interface OrderNote {
  id: string;
  body: string;
  visibility: NoteVisibility;
  authorId: number | null;
  createdAt: string;
}

export interface ReturnItem {
  orderItemId: string;
  variantId: string | null;
  sku: string;
  productTitle: string;
  quantity: number;
  unitPrice: number;
}

export interface ReturnRequest {
  id: string;
  reasonCode: string;
  status: ReturnStatus;
  note: string | null;
  items: ReturnItem[];
  refundAmount: number | null;
  createdAt: string;
}

export interface AdminOrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  email: string;
  currency: string;
  subtotal: number;
  shippingTotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  couponCode: string | null;
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;
  paymentStatus: PaymentStatus | null;
  items: OrderItem[];
  createdAt: string;
}

export interface AdminOrderDetail extends AdminOrderListItem {
  paymentMethod: string | null;
  refundedAmount: number;
  shipmentEvents: ShipmentEvent[];
  notes: OrderNote[];
  returns: ReturnRequest[];
  customer: {
    id: number;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
}

export interface AdminOrderListResponse {
  items: AdminOrderListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminOrderQuery {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  search?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: AdminOrderQuery): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

export function listAdminOrders(
  query: AdminOrderQuery = {},
): Promise<AdminOrderListResponse> {
  return apiClient.get<AdminOrderListResponse>(`/admin/orders${toQuery(query)}`);
}

export function getAdminOrder(id: string): Promise<AdminOrderDetail> {
  return apiClient.get<AdminOrderDetail>(`/admin/orders/${id}`);
}

export function updateOrderStatus(
  id: string,
  input: { status: OrderStatus; note?: string },
): Promise<AdminOrderDetail> {
  return apiClient.patch<AdminOrderDetail>(`/admin/orders/${id}/status`, input);
}

export function addOrderNote(
  id: string,
  input: { body: string; visibility: NoteVisibility },
): Promise<OrderNote> {
  return apiClient.post<OrderNote>(`/admin/orders/${id}/notes`, input);
}

export function setTracking(
  id: string,
  input: { carrier: Carrier; trackingNumber: string; note?: string },
): Promise<AdminOrderDetail> {
  return apiClient.post<AdminOrderDetail>(`/admin/orders/${id}/tracking`, input);
}

export function refundOrder(
  id: string,
  input: { amountCents?: number },
): Promise<AdminOrderDetail> {
  return apiClient.post<AdminOrderDetail>(`/admin/orders/${id}/refund`, input);
}

export function approveReturn(
  id: string,
  returnId: string,
  input: { note?: string } = {},
): Promise<ReturnRequest> {
  return apiClient.post<ReturnRequest>(
    `/admin/orders/${id}/return/${returnId}/approve`,
    input,
  );
}

export function rejectReturn(
  id: string,
  returnId: string,
  input: { note?: string } = {},
): Promise<ReturnRequest> {
  return apiClient.post<ReturnRequest>(
    `/admin/orders/${id}/return/${returnId}/reject`,
    input,
  );
}

/** Top-level navigable invoice URL (cookie auth travels on the GET). */
export function invoiceUrl(id: string): string {
  return `${API_BASE}/admin/orders/${id}/invoice`;
}
