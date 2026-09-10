"use client";

import { useEffect, useRef } from "react";
import { useRecordView } from "@/lib/api/hooks/search";

/**
 * Record a product view exactly once per mounted product (FR-224). The product
 * detail page (script 14) calls this on mount; it works for guests (cookie) and
 * customers (per-account) via the credentialed apiClient. Fire-and-forget — a
 * failed record never surfaces to the user.
 */
export function useRecordProductView(productId: string | undefined): void {
  const record = useRecordView();
  const recorded = useRef<string | null>(null);

  useEffect(() => {
    if (!productId || recorded.current === productId) return;
    recorded.current = productId;
    record.mutate(productId);
    // record.mutate is stable; we intentionally key only on productId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);
}
