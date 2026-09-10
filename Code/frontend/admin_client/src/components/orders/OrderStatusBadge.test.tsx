import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  OrderStatusBadge,
  PaymentStatusBadge,
  ReturnStatusBadge,
} from "./OrderStatusBadge";

describe("order/payment/return badges", () => {
  it("humanizes the order status label", () => {
    render(<OrderStatusBadge status="PROCESSING" />);
    expect(screen.getByText("Processing")).toBeInTheDocument();
  });
  it("humanizes a snake_case payment status", () => {
    render(<PaymentStatusBadge status="PARTIALLY_REFUNDED" />);
    expect(screen.getByText("Partially refunded")).toBeInTheDocument();
  });
  it("humanizes the return status label", () => {
    render(<ReturnStatusBadge status="APPROVED" />);
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
