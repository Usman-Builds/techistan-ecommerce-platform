import type {
  OrderStatus,
  PaymentStatus,
  ReturnStatus,
} from "@/lib/api/orders";
import { cn } from "@/lib/utils";

/**
 * Order / payment / return status pills.
 *
 * These used to carry a literal rainbow — amber, blue, indigo, sky, emerald,
 * rose, orange — one hue per status. That is more colours than the rest of the
 * admin uses put together, and against a black-and-gold palette it read as
 * seven unrelated widgets. Statuses now map onto the FOUR semantic tones the
 * design system already has:
 *
 *   waiting on someone → warning   in motion → brand   done → success
 *                       failed / reversed → destructive
 *
 * The label always says the exact status, so colour is a second cue and never
 * the only one (WCAG 1.4.1). Kept as its own component rather than folded into
 * `StatusBadge` because these three enums want an exhaustive map — a new order
 * status should fail the build here, not silently fall through to "neutral".
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

const PAYMENT_TONES: Record<PaymentStatus, Tone> = {
  REQUIRES_PAYMENT: "warning",
  PROCESSING: "warning",
  SUCCEEDED: "success",
  FAILED: "danger",
  REFUNDED: "danger",
  PARTIALLY_REFUNDED: "warning",
};

const RETURN_TONES: Record<ReturnStatus, Tone> = {
  REQUESTED: "warning",
  APPROVED: "success",
  REJECTED: "danger",
  COMPLETED: "success",
};

function label(status: string): string {
  const s = status.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function Badge({ tone, text }: { tone: Tone; text: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2.5 py-0.5 text-xs font-medium",
        TONE_CLASS[tone],
      )}
    >
      {text}
    </span>
  );
}

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={ORDER_TONES[status]} text={label(status)} />;
}

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Badge tone={PAYMENT_TONES[status]} text={label(status)} />;
}

export function ReturnStatusBadge({ status }: { status: ReturnStatus }) {
  return <Badge tone={RETURN_TONES[status]} text={label(status)} />;
}
