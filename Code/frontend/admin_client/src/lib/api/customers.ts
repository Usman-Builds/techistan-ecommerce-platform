/**
 * Admin customer management API (script 15, FR-804). RBAC enforced server-side by
 * the `@AdminOnly()` endpoints (NFR-208); the UI hides admin-only affordances but
 * never grants access the API wouldn't.
 */
import { apiClient } from "./client";

export type UserStatus = "ACTIVE" | "BANNED";

export interface CustomerListItem {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  status: UserStatus;
  createdAt: string;
  orderCount: number;
  totalSpentCents: number;
}

export interface CustomerAddress {
  id: string;
  label: string | null;
  fullName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
}

export interface CustomerOrderSummary {
  id: string;
  orderNumber: string;
  status: string;
  grandTotal: number;
  currency: string;
  createdAt: string;
}

export interface CustomerDetail {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string | null;
  status: UserStatus;
  provider: string;
  emailVerified: string | null;
  createdAt: string;
  addresses: CustomerAddress[];
  orders: CustomerOrderSummary[];
  lifetimeSpentCents: number;
  paidOrderCount: number;
}

export interface CustomerListResponse {
  items: CustomerListItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CustomerQuery {
  search?: string;
  status?: UserStatus;
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

export function listCustomers(query: CustomerQuery = {}): Promise<CustomerListResponse> {
  return apiClient.get<CustomerListResponse>(
    `/admin/customers${toQuery(query as Record<string, unknown>)}`,
  );
}

export function getCustomer(id: number): Promise<CustomerDetail> {
  return apiClient.get<CustomerDetail>(`/admin/customers/${id}`);
}

export function setCustomerStatus(
  id: number,
  status: UserStatus,
): Promise<CustomerListItem> {
  return apiClient.patch<CustomerListItem>(`/admin/customers/${id}/status`, { status });
}
