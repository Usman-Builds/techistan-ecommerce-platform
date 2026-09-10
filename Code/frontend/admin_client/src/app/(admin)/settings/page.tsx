"use client";

import { Loader2, Settings as SettingsIcon } from "lucide-react";
import { useAdminSettings } from "@/lib/api/hooks/settings";
import { SettingsForm } from "@/components/settings/SettingsForm";

export default function SettingsPage() {
  const { data, isLoading, isError, refetch } = useAdminSettings();

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="flex items-center gap-2 font-heading text-2xl font-bold">
        <SettingsIcon className="h-6 w-6" aria-hidden /> Store settings
      </h1>

      {isLoading ? (
        <div className="flex justify-center py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      ) : isError || !data ? (
        <div className="py-16 text-center">
          <p className="text-destructive">Failed to load settings.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Retry
          </button>
        </div>
      ) : (
        <SettingsForm initial={data} />
      )}
    </div>
  );
}
