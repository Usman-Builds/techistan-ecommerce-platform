import { describe, expect, it } from "vitest";
import { TRANSITIONS } from "./StatusControl";

describe("StatusControl transitions", () => {
  it("does not offer CONFIRMED for an unpaid order (#50)", () => {
    // Confirmation happens through payment only; the backend rejects it too.
    expect(TRANSITIONS.PENDING).toEqual(["CANCELLED"]);
  });

  it("never offers REFUNDED (refunds use the refund panel)", () => {
    for (const targets of Object.values(TRANSITIONS)) {
      expect(targets).not.toContain("REFUNDED");
    }
  });
});
