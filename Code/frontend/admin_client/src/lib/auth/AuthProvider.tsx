"use client";

import { createContext, useContext, useCallback } from "react";
import {
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { ApiError } from "@/lib/api/client";
import * as authApi from "@/lib/api/auth";
import { isAdminRole, type User } from "@/lib/api/auth";

const ME_KEY = ["auth", "me"] as const;

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refetch: () => Promise<unknown>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();

  const {
    data: user,
    isLoading,
    refetch,
  } = useQuery<User | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await authApi.getMe();
      } catch (err) {
        // Logged-out users get a 401 from /auth/me — treat as "no user".
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
    staleTime: 60 * 1000,
  });

  const login = useCallback(
    async (email: string, password: string) => {
      const { user } = await authApi.login({ email, password });
      await invalidateMe(queryClient);
      return user;
    },
    [queryClient],
  );

  const logout = useCallback(async () => {
    await authApi.logout();
    queryClient.setQueryData(ME_KEY, null);
    await invalidateMe(queryClient);
  }, [queryClient]);

  const value: AuthContextValue = {
    user: user ?? null,
    isLoading,
    isAuthenticated: Boolean(user),
    isAdmin: isAdminRole(user?.role),
    login,
    logout,
    refetch,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

async function invalidateMe(queryClient: QueryClient) {
  await queryClient.invalidateQueries({ queryKey: ME_KEY });
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
