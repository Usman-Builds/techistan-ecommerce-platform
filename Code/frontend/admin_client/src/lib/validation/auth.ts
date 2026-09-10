import { z } from "zod";

/**
 * Admin login schema. Admins authenticate with email + a non-empty password;
 * the backend is the source of truth for credential and role checks. There is
 * no register/reset schema here by design (admin accounts are provisioned via
 * `seedAdmin` / CLI, not self-service).
 */
export const loginSchema = z.object({
  email: z.email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginInput = z.infer<typeof loginSchema>;
