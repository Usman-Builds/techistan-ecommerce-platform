import { z } from "zod";

/**
 * Promotions editor schemas (react-hook-form + Zod, script 12). These mirror the
 * backend class-validator DTOs; the backend remains the source of truth (code
 * uniqueness, RBAC). Money is entered as dollars and converted to cents on submit;
 * a PERCENT coupon's `value` is a whole percent (0–100).
 */
export const couponFormSchema = z.object({
  code: z
    .string()
    .min(2, "Code must be at least 2 characters")
    .max(40)
    .regex(/^[A-Za-z0-9_-]+$/, "Letters, numbers, dashes and underscores only"),
  type: z.enum(["PERCENT", "FIXED", "FREE_SHIPPING"]),
  // For PERCENT this is a whole percent; for FIXED it is a dollars amount.
  value: z.string().optional(),
  minOrder: z.string().optional(),
  maxDiscount: z.string().optional(),
  usageLimit: z.string().optional(),
  perCustomerLimit: z.string().optional(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  active: z.boolean(),
});

export type CouponFormValues = z.infer<typeof couponFormSchema>;

export const automaticDiscountFormSchema = z
  .object({
    name: z.string().min(2, "Name is required").max(80),
    minSubtotal: z.string().optional(),
    minQty: z.string().optional(),
    // Exactly one of percentOff / amountOff (or free shipping) gives the effect.
    effectType: z.enum(["PERCENT", "AMOUNT", "FREE_SHIPPING"]),
    effectValue: z.string().optional(),
    priority: z.string().optional(),
    status: z.enum(["ACTIVE", "SCHEDULED", "DISABLED"]),
    startsAt: z.string().optional(),
    endsAt: z.string().optional(),
  })
  .refine(
    (v) => v.effectType === "FREE_SHIPPING" || Boolean(v.effectValue?.trim()),
    { message: "Enter a discount value", path: ["effectValue"] },
  );

export type AutomaticDiscountFormValues = z.infer<
  typeof automaticDiscountFormSchema
>;
