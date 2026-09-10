/**
 * Typed auth API layer for the admin client. Cookies (httpOnly access + refresh)
 * flow automatically because apiClient sends `credentials: "include"`.
 *
 * Admins use the dedicated POST /auth/admin/login, which rejects any non-admin
 * credential server-side (403) before issuing a session. No register, no Google,
 * no self-service reset here.
 */
import { apiClient } from "./client";

export type Role = "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  provider: "LOCAL" | "GOOGLE";
  emailVerified: string | null;
  profilePhoto: string | null;
};

export type AuthResponse = { user: User; accessToken: string };

export const ADMIN_ROLES: Role[] = ["ADMIN", "SUPER_ADMIN"];

export function isAdminRole(role: Role | undefined | null): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

export function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/auth/admin/login", input);
}

export function logout(): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/logout");
}

export function getMe(): Promise<User> {
  return apiClient.get<User>("/auth/me");
}
