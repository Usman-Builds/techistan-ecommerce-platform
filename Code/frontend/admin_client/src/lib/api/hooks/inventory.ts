"use client";

/**
 * TanStack Query hooks for admin inventory (script 15, FR-805). The stock
 * adjustment is optimistic: the cached row updates immediately, then reconciles
 * against the server response (or rolls back on error).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  adjustStock,
  getLowStock,
  listInventory,
  type InventoryQuery,
  type InventoryResponse,
} from "../inventory";

export const INVENTORY_KEY = ["admin", "inventory"] as const;
export const LOW_STOCK_KEY = ["admin", "inventory", "low-stock"] as const;

export function useInventory(query: InventoryQuery) {
  return useQuery({
    queryKey: [...INVENTORY_KEY, query],
    queryFn: () => listInventory(query),
    placeholderData: (prev) => prev,
  });
}

export function useLowStock() {
  return useQuery({ queryKey: LOW_STOCK_KEY, queryFn: getLowStock });
}

export function useAdjustStock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ variantId, stock }: { variantId: string; stock: number }) =>
      adjustStock(variantId, stock),
    onMutate: async ({ variantId, stock }) => {
      await qc.cancelQueries({ queryKey: INVENTORY_KEY });
      const snapshots = qc.getQueriesData<InventoryResponse>({ queryKey: INVENTORY_KEY });
      for (const [key, data] of snapshots) {
        if (!data || !("items" in data)) continue;
        qc.setQueryData<InventoryResponse>(key, {
          ...data,
          items: data.items.map((it) =>
            it.variantId === variantId
              ? { ...it, stock, lowStock: stock <= data.threshold }
              : it,
          ),
        });
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.snapshots.forEach(([key, data]) => qc.setQueryData(key, data));
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: INVENTORY_KEY });
      qc.invalidateQueries({ queryKey: LOW_STOCK_KEY });
    },
  });
}
