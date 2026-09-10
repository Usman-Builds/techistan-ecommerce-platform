"use client";

/** TanStack Query hooks for admin customer management (script 15, FR-804). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCustomer,
  listCustomers,
  setCustomerStatus,
  type CustomerQuery,
  type UserStatus,
} from "../customers";

export const CUSTOMERS_KEY = ["admin", "customers"] as const;
export const CUSTOMER_KEY = (id: number) => ["admin", "customer", id] as const;

export function useCustomers(query: CustomerQuery) {
  return useQuery({
    queryKey: [...CUSTOMERS_KEY, query],
    queryFn: () => listCustomers(query),
    placeholderData: (prev) => prev,
  });
}

export function useCustomer(id: number) {
  return useQuery({
    queryKey: CUSTOMER_KEY(id),
    queryFn: () => getCustomer(id),
    enabled: Number.isFinite(id),
  });
}

export function useSetCustomerStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: UserStatus }) =>
      setCustomerStatus(id, status),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      qc.invalidateQueries({ queryKey: CUSTOMER_KEY(id) });
    },
  });
}
