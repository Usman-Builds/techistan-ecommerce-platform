/**
 * Typed auth API layer over the shared apiClient. Cookies (httpOnly access +
 * refresh) flow automatically because apiClient sends `credentials: "include"`.
 */
import { apiClient } from "./client";

export type User = {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: "CUSTOMER" | "ADMIN" | "SUPER_ADMIN";
  provider: "LOCAL" | "GOOGLE";
  emailVerified: string | null;
  profilePhoto: string | null;
  /** Set while a GDPR account deletion is pending inside the grace window. */
  deletionScheduledAt: string | null;
};

export type AuthResponse = { user: User; accessToken: string };

export function register(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/auth/register", input);
}

export function login(input: {
  email: string;
  password: string;
}): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/auth/login", input);
}

export function logout(): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/logout");
}

export function getMe(): Promise<User> {
  return apiClient.get<User>("/auth/me");
}

export function verifyEmail(token: string): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/verify-email", { token });
}

export function resendVerification(
  email: string,
): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/resend-verification", {
    email,
  });
}

export function forgotPassword(email: string): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/forgot-password", {
    email,
  });
}

export function resetPassword(
  token: string,
  password: string,
): Promise<{ success: boolean }> {
  return apiClient.post<{ success: boolean }>("/auth/reset-password", {
    token,
    password,
  });
}

export function refresh(): Promise<AuthResponse> {
  return apiClient.post<AuthResponse>("/auth/refresh");
}
