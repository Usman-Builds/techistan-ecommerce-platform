import { OrderStatus } from '@prisma/client';

/**
 * Order lifecycle state machine (script 11, FR-501). Transitions are enforced in
 * the service layer, never the client (NFR-208). The happy path is:
 *
 *   PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED → COMPLETED
 *
 * plus the escape hatches CANCELLED and REFUNDED. CONFIRMED is normally reached
 * by the Stripe webhook (script 10); REFUNDED is reached only through the refund
 * flow (PaymentService.processRefund), so it is intentionally NOT a target of
 * `updateStatus` — see {@link assertTransition}.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.CANCELLED,
  ],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.COMPLETED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.REFUNDED]: [],
};

/** True if `from → to` is a permitted lifecycle transition. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses from which a customer may still self-cancel (unpaid orders only). */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = [OrderStatus.PENDING];

/** Statuses from which a return may be requested (order has been received). */
export const RETURN_ELIGIBLE: OrderStatus[] = [
  OrderStatus.DELIVERED,
  OrderStatus.COMPLETED,
];

/**
 * Carrier → tracking-URL template map (FR-504). `{tracking}` is replaced with the
 * tracking number. Keep the enum keys in sync with `Carrier` in set-tracking.dto.
 */
export const CARRIER_TRACKING_URLS: Record<string, string> = {
  UPS: 'https://www.ups.com/track?tracknum={tracking}',
  USPS: 'https://tools.usps.com/go/TrackConfirmAction?tLabels={tracking}',
  FEDEX: 'https://www.fedex.com/fedextrack/?trknbr={tracking}',
  DHL: 'https://www.dhl.com/en/express/tracking.html?AWB={tracking}',
  OTHER: '',
};

/** Build a clickable carrier tracking URL, or null when the carrier has none. */
export function buildTrackingUrl(
  carrier: string,
  trackingNumber: string,
): string | null {
  const template = CARRIER_TRACKING_URLS[carrier.toUpperCase()];
  if (!template) return null;
  return template.replace('{tracking}', encodeURIComponent(trackingNumber));
}
