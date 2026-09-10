import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

const TONE_CLASS: Record<BadgeTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  success: "bg-success/15 text-success",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
  info: "bg-primary/15 text-primary",
};

/** Map well-known status strings across domains to a badge tone (color-coding is
 * paired with the label text, never color-only — WCAG). */
export function statusTone(status: string): BadgeTone {
  switch (status.toUpperCase()) {
    case "ACTIVE":
    case "APPROVED":
    case "COMPLETED":
    case "DELIVERED":
    case "SUCCEEDED":
    case "CONFIRMED":
      return "success";
    case "PENDING":
    case "PROCESSING":
    case "REQUIRES_PAYMENT":
    case "SCHEDULED":
    case "DRAFT":
      return "warning";
    case "BANNED":
    case "REJECTED":
    case "CANCELLED":
    case "FAILED":
    case "REFUNDED":
    case "ARCHIVED":
    case "DISABLED":
      return "danger";
    case "SHIPPED":
    case "PARTIALLY_REFUNDED":
      return "info";
    default:
      return "neutral";
  }
}

/** Accessible status pill. Pass an explicit `tone` or let it infer from `status`. */
export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string;
  tone?: BadgeTone;
  className?: string;
}) {
  const resolved = tone ?? statusTone(status);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        TONE_CLASS[resolved],
        className,
      )}
    >
      {status.toLowerCase().replace(/_/g, " ")}
    </span>
  );
}
