import { describe, it, expect } from "vitest";
import {
  passwordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  passwordStrength,
} from "./auth";

/**
 * Client auth schemas mirror the backend password DTO (FR-105). These lock the
 * accept/reject boundary so the UI rejects exactly what the server would.
 */
describe("passwordSchema", () => {
  it("accepts a strong password", () => {
    expect(passwordSchema.safeParse("Str0ng!pass").success).toBe(true);
  });

  it.each([
    ["Sh0rt!", false, "too short (6 chars)"],
    ["alllower1!", false, "no uppercase"],
    ["NoNumber!", false, "no digit"],
    ["NoSymbol1", false, "no symbol"],
  ])("rejects %s (%s)", (pw, ok) => {
    expect(passwordSchema.safeParse(pw).success).toBe(ok);
  });
});

describe("loginSchema", () => {
  it("accepts a valid email + non-empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
  });
  it("rejects a malformed email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "x" }).success).toBe(false);
  });
  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });
});

describe("registerSchema", () => {
  it("accepts a complete valid payload", () => {
    const r = registerSchema.safeParse({
      firstName: "Ann",
      lastName: "Lee",
      email: "ann@example.com",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(true);
  });
  it("requires first and last name", () => {
    const r = registerSchema.safeParse({
      firstName: "",
      lastName: "",
      email: "ann@example.com",
      password: "Str0ng!pass",
    });
    expect(r.success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  it("rejects when the confirmation does not match", () => {
    const r = resetPasswordSchema.safeParse({
      password: "Str0ng!pass",
      confirmPassword: "Different1!",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("confirmPassword"))).toBe(true);
    }
  });
  it("accepts a matching confirmation", () => {
    expect(
      resetPasswordSchema.safeParse({
        password: "Str0ng!pass",
        confirmPassword: "Str0ng!pass",
      }).success,
    ).toBe(true);
  });
});

describe("passwordStrength", () => {
  it("scores 0 for empty and 4 for a full-strength password", () => {
    expect(passwordStrength("")).toBe(0);
    expect(passwordStrength("Str0ng!pass")).toBe(4);
  });
  it("increments per satisfied rule", () => {
    expect(passwordStrength("abcdefgh")).toBe(1); // length only
    expect(passwordStrength("Abcdefgh")).toBe(2); // + uppercase
    expect(passwordStrength("Abcdefg1")).toBe(3); // + number
  });
});
