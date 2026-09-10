"use client";

/** TanStack Query hooks for admin order management (script 11). */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addOrderNote,
  approveReturn,
  getAdminOrder,
  listAdminOrders,
  refundOrder,
  rejectReturn,
  setTracking,
  updateOrderStatus,
  type AdminOrderQuery,
  type Carrier,
  type NoteVisibility,
  type OrderStatus,
} from "../orders";

export const ORDERS_KEY = ["admin", "orders"] as const;
export const ORDER_KEY = (id: string) => ["admin", "order", id] as const;

export function useAdminOrders(query: AdminOrderQuery) {
  return useQuery({
    queryKey: [...ORDERS_KEY, query],
    queryFn: () => listAdminOrders(query),
    placeholderData: (prev) => prev, // stable table while paging/filtering
  });
}

export function useAdminOrder(id: string | undefined) {
  return useQuery({
    queryKey: ORDER_KEY(id ?? "none"),
    queryFn: () => getAdminOrder(id!),
    enabled: !!id,
  });
}

/** Shared invalidation: refresh both the detail and the list after a mutation. */
function useOrderInvalidation(id: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ORDER_KEY(id) });
    qc.invalidateQueries({ queryKey: ORDERS_KEY });
  };
}

export function useUpdateStatus(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (input: { status: OrderStatus; note?: string }) =>
      updateOrderStatus(id, input),
    onSuccess: invalidate,
  });
}

export function useAddNote(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (input: { body: string; visibility: NoteVisibility }) =>
      addOrderNote(id, input),
    onSuccess: invalidate,
  });
}

export function useSetTracking(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (input: {
      carrier: Carrier;
      trackingNumber: string;
      note?: string;
    }) => setTracking(id, input),
    onSuccess: invalidate,
  });
}

export function useRefundOrder(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (input: { amountCents?: number }) => refundOrder(id, input),
    onSuccess: invalidate,
  });
}

export function useApproveReturn(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (vars: { returnId: string; note?: string }) =>
      approveReturn(id, vars.returnId, { note: vars.note }),
    onSuccess: invalidate,
  });
}

export function useRejectReturn(id: string) {
  const invalidate = useOrderInvalidation(id);
  return useMutation({
    mutationFn: (vars: { returnId: string; note?: string }) =>
      rejectReturn(id, vars.returnId, { note: vars.note }),
    onSuccess: invalidate,
  });
}
