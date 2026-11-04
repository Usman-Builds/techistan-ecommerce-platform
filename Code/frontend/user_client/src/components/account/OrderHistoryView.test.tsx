import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import type { OrderQuery } from "@/lib/api/orders";
import { OrderHistoryView } from "./OrderHistoryView";

/** #55: the order history is paginated server-side. */
const { useMyOrders } = vi.hoisted(() => ({ useMyOrders: vi.fn() }));
vi.mock("../../lib/api/hooks/orders", () => ({
  useMyOrders: (query: OrderQuery) => useMyOrders(query) as unknown,
}));

const order = (n: number) => ({
  id: `o${n}`,
  orderNumber: `ORD-${n}`,
  status: "DELIVERED",
  currency: "USD",
  grandTotal: 1000,
  items: [],
  createdAt: "2026-01-01T00:00:00Z",
});

describe("OrderHistoryView pagination", () => {
  beforeEach(() => {
    useMyOrders.mockReset();
    useMyOrders.mockImplementation((q: OrderQuery) => ({
      data: {
        items: [order(q.page ?? 1)],
        total: 45,
        page: q.page ?? 1,
        pageSize: 20,
      },
      isPending: false,
      isError: false,
    }));
  });

  it("requests page 1 and shows the page count", () => {
    render(<OrderHistoryView />);
    expect(useMyOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1 }),
    );
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();
  });

  it("moves to the next page and back to page 1 when a filter changes", () => {
    render(<OrderHistoryView />);
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(useMyOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 2 }),
    );
    expect(screen.getByText("ORD-2")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Filter by status"), {
      target: { value: "SHIPPED" },
    });
    expect(useMyOrders).toHaveBeenLastCalledWith(
      expect.objectContaining({ page: 1, status: "SHIPPED" }),
    );
  });

  it("hides the pager when everything fits on one page", () => {
    useMyOrders.mockReturnValue({
      data: { items: [order(1)], total: 1, page: 1, pageSize: 20 },
      isPending: false,
      isError: false,
    });
    render(<OrderHistoryView />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});
