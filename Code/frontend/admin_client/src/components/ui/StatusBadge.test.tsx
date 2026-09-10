import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, statusTone } from "./StatusBadge";

/**
 * Status tone mapping is paired with the label text (never color-only — WCAG).
 */
describe("statusTone", () => {
  it("maps positive states to success", () => {
    for (const s of ["ACTIVE", "DELIVERED", "SUCCEEDED", "approved"]) {
      expect(statusTone(s)).toBe("success");
    }
  });
  it("maps in-progress states to warning", () => {
    for (const s of ["PENDING", "PROCESSING", "DRAFT", "scheduled"]) {
      expect(statusTone(s)).toBe("warning");
    }
  });
  it("maps terminal-negative states to danger", () => {
    for (const s of ["CANCELLED", "FAILED", "REFUNDED", "banned"]) {
      expect(statusTone(s)).toBe("danger");
    }
  });
  it("maps shipping/partial states to info", () => {
    expect(statusTone("SHIPPED")).toBe("info");
    expect(statusTone("PARTIALLY_REFUNDED")).toBe("info");
  });
  it("falls back to neutral for unknown states", () => {
    expect(statusTone("WHATEVER")).toBe("neutral");
  });
});

describe("StatusBadge", () => {
  it("renders a humanized label", () => {
    render(<StatusBadge status="REQUIRES_PAYMENT" />);
    expect(screen.getByText("requires payment")).toBeInTheDocument();
  });
  it("honors an explicit tone override", () => {
    const { container } = render(<StatusBadge status="ACTIVE" tone="danger" />);
    expect(container.firstChild).toHaveClass("text-destructive");
  });
});
