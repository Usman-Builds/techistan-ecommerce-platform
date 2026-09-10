"use client";

/**
 * Checkout + order TanStack Query hooks (script 10, Task 10). `useCreateOrder`
 * runs the idempotent order creation; `useOrder` polls a single order until the
 * webhook flips it to a terminal state (the client never trusts its own redirect
 * for payment truth). Saved-address hooks back the shipping step.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  cancelOrder,
  createOrder,
  getOrder,
  listMyOrders,
  requestReturn,
  type CreateOrderInput,
  type CreateReturnInput,
  type Order,
  type OrderQuery,
} from "../orders";
import {
  createAddress,
  deleteAddress,
  listAddresses,
  type CreateAddressInput,
} from "../addresses";

export const ORDER_KEY = (id: string) => ["order", id] as const;
export const MY_ORDERS_KEY = ["orders", "mine"] as const;
export const ADDRESSES_KEY = ["addresses"] as const;

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOrderInput) => createOrder(input),
    onSuccess: ({ order }) => {
      qc.setQueryData(ORDER_KEY(order.id), order);
    },
  });
}

/** True once the order reached a state where polling should stop. */
function isTerminal(order: Order | undefined): boolean {
  if (!order) return false;
  return (
    order.status !== "PENDING" ||
    order.paymentStatus === "FAILED" ||
    order.paymentStatus === "SUCCEEDED"
  );
}

/**
 * Fetch + poll a single order. While the order is still PENDING (webhook not yet
 * processed) it refetches every 2s; polling stops once a terminal state is seen.
 */
export function useOrder(id: string | null, poll = true) {
  return useQuery({
    queryKey: ORDER_KEY(id ?? "none"),
    queryFn: () => getOrder(id as string),
    enabled: Boolean(id),
    refetchInterval: (query) =>
      poll && !isTerminal(query.state.data as Order | undefined) ? 2000 : false,
  });
}

export function useMyOrders(query: OrderQuery = {}, enabled = true) {
  return useQuery({
    queryKey: [...MY_ORDERS_KEY, query],
    queryFn: () => listMyOrders(query),
    enabled,
    placeholderData: (prev) => prev, // keep the list stable while filtering
  });
}

export function useCancelOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => cancelOrder(id),
    onSuccess: (order) => {
      qc.setQueryData(ORDER_KEY(id), order);
      qc.invalidateQueries({ queryKey: MY_ORDERS_KEY });
    },
  });
}

export function useRequestReturn(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateReturnInput) => requestReturn(id, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ORDER_KEY(id) });
    },
  });
}

export function useSavedAddresses(enabled = true) {
  return useQuery({
    queryKey: ADDRESSES_KEY,
    queryFn: listAddresses,
    enabled,
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAddressInput) => createAddress(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ADDRESSES_KEY }),
  });
}
