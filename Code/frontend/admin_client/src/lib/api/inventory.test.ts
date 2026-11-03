import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #17: the stock save must carry the value the admin was looking at, so the API
 * can reject it (409) when a sale changed stock meanwhile instead of
 * overwriting the decrement with a stale absolute value.
 */
const patch = vi.fn();
vi.mock("./client", () => ({ apiClient: { patch: (...a: unknown[]) => patch(...a) } }));

import { adjustStock } from "./inventory";

beforeEach(() => patch.mockReset().mockResolvedValue({}));

describe("adjustStock", () => {
  it("sends expectedStock alongside the new stock", async () => {
    await adjustStock("v1", 15, 10);
    expect(patch).toHaveBeenCalledWith("/admin/inventory/v1", {
      stock: 15,
      expectedStock: 10,
    });
  });

  it("omits expectedStock when it isn't known", async () => {
    await adjustStock("v1", 15);
    expect(patch).toHaveBeenCalledWith("/admin/inventory/v1", { stock: 15 });
  });
});
