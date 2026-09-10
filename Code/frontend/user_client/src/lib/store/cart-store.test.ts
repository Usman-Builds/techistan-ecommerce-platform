import { describe, it, expect, beforeEach } from "vitest";
import { useCartStore } from "./cart-store";
import type { Cart } from "@/lib/api/cart";

/**
 * Cart UI mirror (Zustand). Pure reducers — we drive the store directly via
 * getState() and assert the state transitions the header badge + drawer rely on.
 */
const fakeCart = (over: Partial<Cart> = {}): Cart =>
  ({
    id: "c1",
    items: [{ id: "l1" }, { id: "l2" }],
    itemCount: 3,
    subtotal: 4998,
    ...over,
  }) as unknown as Cart;

describe("useCartStore", () => {
  beforeEach(() => {
    useCartStore.getState().reset();
    useCartStore.setState({ isOpen: false });
  });

  it("syncs a server cart snapshot into the mirror", () => {
    useCartStore.getState().sync(fakeCart());
    const s = useCartStore.getState();
    expect(s.itemCount).toBe(3);
    expect(s.subtotal).toBe(4998);
    expect(s.items).toHaveLength(2);
  });

  it("reset clears the snapshot", () => {
    useCartStore.getState().sync(fakeCart());
    useCartStore.getState().reset();
    const s = useCartStore.getState();
    expect(s.itemCount).toBe(0);
    expect(s.subtotal).toBe(0);
    expect(s.items).toEqual([]);
  });

  it("open / close / toggle drive the drawer", () => {
    const { open, close, toggle } = useCartStore.getState();
    open();
    expect(useCartStore.getState().isOpen).toBe(true);
    close();
    expect(useCartStore.getState().isOpen).toBe(false);
    toggle();
    expect(useCartStore.getState().isOpen).toBe(true);
    toggle();
    expect(useCartStore.getState().isOpen).toBe(false);
  });
});
