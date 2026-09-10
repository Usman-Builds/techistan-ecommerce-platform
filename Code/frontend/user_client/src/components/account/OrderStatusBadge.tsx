import type { OrderStatus, PaymentStatus, ReturnStatus } from "@/lib/api/orders";

/**
 * Order / payment / return status pills.
 *
 * These used to carry a literal rainbow — amber, blue, indigo, sky, emerald,
 * rose, orange — one hue per status. That is more colours than the rest of the
 * product uses put together, and against a black-and-gold palette it read as
 * seven unrelated widgets. Statuses now map onto the FOUR semantic tones the
 * design system already has:
 *
 *   waiting on someone → warning   in motion → brand   done → success
 *                       failed / reversed → destructive
 *
 * The label always says the exact status, so colour is a second cue and never
 * the only one (WCAG 1.4.1) — which is also why collapsing "shipped" and
 * "processing" into one tone loses nothing.
 */
type Tone = "neutral" | "brand" | "success" | "warning" | "danger";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground",
  brand: "bg-primary/15 text-primary",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
};

const ORDER_TONES: Record<OrderStatus, Tone> = {
  PENDING: "warning",
  CONFIRMED: "brand",
  PROCESSING: "brand",
  SHIPPED: "brand",
  DELIVERED: "success",
  COMPLETED: "success",
  CANCELLED: "neutral",
  REFUNDED: "danger",
};

const RETURN_TONES: Record<ReturnStatus, Tone> = {
  REQUESTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  COMPLETED: "success",
};

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  REQUIRES_PAYMENT: "warning",
  PROCESSING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "danger",
  PARTIALLY_REFUNDED: "warning",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status]}>{label(status)}</Badge>;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge tone={RETURN_TONES[status]}>{label(status)}</Badge>;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status]}>{label(status)}</Badge>;
}

function Badge({
  tone,
  children,
}: {
  tone: Tone;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASS[tone]}`}
    >
      {children}
    </span>
  );
}

/** "PARTIALLY_REFUNDED" → "Partially refunded". */
function label(status: string): string {
  const s = status.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}
