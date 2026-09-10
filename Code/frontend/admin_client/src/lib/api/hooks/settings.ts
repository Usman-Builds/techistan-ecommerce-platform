"use client";

/** TanStack Query hooks for admin store settings (script 15, FR-810). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getAdminSettings,
  updateSettings,
  type UpdateSettingsInput,
} from "../settings";

export const SETTINGS_KEY = ["admin", "settings"] as const;

export function useAdminSettings() {
  return useQuery({ queryKey: SETTINGS_KEY, queryFn: getAdminSettings });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateSettingsInput) => updateSettings(input),
    onSuccess: (data) => {
      qc.setQueryData(SETTINGS_KEY, data);
    },
  });
}
