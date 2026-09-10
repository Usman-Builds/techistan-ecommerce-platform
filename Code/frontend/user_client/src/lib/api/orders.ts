/**
 * Checkout + order API bindings (script 10). Everything rides the shared
 * credentialed `apiClient` so the guest cart cookie / customer JWT travel along.
 * Totals are always computed server-side; the client only sends the cart-derived
 * order it wants and the address. Money is integer cents.
 */
import { apiClient } from "./client";

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
  unitPrice: number; // cents
  total: number; // cents
}

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

export interface Order {
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

export interface CreateOrderInput {
  email: string;
  idempotencyKey: string;
  shippingAddress: OrderAddress;
  billingAddress?: OrderAddress;
  saveAddress?: boolean;
}

export interface CreateOrderResult {
  order: Order;
  /** null for a $0 order (already confirmed) or when Stripe is not configured. */
  clientSecret: string | null;
}

// ── Order lifecycle (script 11) ──

export type NoteVisibility = "INTERNAL" | "CUSTOMER";

export interface OrderNote {
  id: string;
  body: string;
  visibility: NoteVisibility;
  authorId: number | null;
  createdAt: string;
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

export type ReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";

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

/** Detail shape returned by GET /orders/:id — a superset of Order. */
export interface OrderDetail extends Order {
  paymentMethod: string | null;
  refundedAmount: number;
  shipmentEvents: ShipmentEvent[];
  notes: OrderNote[];
  returns: ReturnRequest[];
}

export type ReturnReason =
  | "DEFECTIVE"
  | "WRONG_ITEM"
  | "NOT_AS_DESCRIBED"
  | "NO_LONGER_NEEDED"
  | "ARRIVED_LATE"
  | "OTHER";

export interface CreateReturnInput {
  reasonCode: ReturnReason;
  items: { orderItemId: string; quantity: number }[];
  note?: string;
}

export interface OrderQuery {
  status?: OrderStatus;
  search?: string;
  from?: string;
  to?: string;
}

export const createOrder = (input: CreateOrderInput) =>
  apiClient.post<CreateOrderResult>("/orders", input);

export const getOrder = (id: string) =>
  apiClient.get<OrderDetail>(`/orders/${id}`);

export const listMyOrders = (query: OrderQuery = {}) => {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v) q.set(k, String(v));
  }
  const s = q.toString();
  return apiClient.get<Order[]>(`/orders${s ? `?${s}` : ""}`);
};

export const cancelOrder = (id: string) =>
  apiClient.post<OrderDetail>(`/orders/${id}/cancel`);

export const requestReturn = (id: string, input: CreateReturnInput) =>
  apiClient.post<ReturnRequest>(`/orders/${id}/return`, input);
