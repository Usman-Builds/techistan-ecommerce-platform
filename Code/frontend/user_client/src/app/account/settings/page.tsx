"use client";

/**
 * Account settings — privacy & data (script 17, CR-005 / FR-114). Surfaces the
 * two GDPR actions that call the NestJS backend: download-my-data and
 * delete-my-account (with the 30-day grace period clearly communicated and an
 * in-window cancel). Auth-gated by the account group layout (server redirect).
 */
import { useState } from "react";
import { AlertTriangle, Download, Loader2, ShieldX } from "lucide-react";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cancelAccountDeletion,
  downloadJson,
  fetchDataExport,
  requestAccountDeletion,
} from "@/lib/api/account";

export default function AccountSettingsPage() {
  const { user, refetch } = useAuth();
  const scheduledAt = user?.deletionScheduledAt ?? null;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">Privacy &amp; data</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Manage your personal data and account under GDPR.
      </p>

      <div className="mt-8 space-y-4">
        <DataExportCard />
        <DeleteAccountCard scheduledAt={scheduledAt} onChange={refetch} />
      </div>
    </main>
  );
}

function DataExportCard() {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  const onExport = async () => {
    setStatus("loading");
    try {
      const data = await fetchDataExport();
      downloadJson(data, "my-data-export.json");
      setStatus("idle");
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
        <div className="flex-1">
          <h2 className="font-medium">Download my data</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Export your profile, addresses, orders, reviews, and notifications as
            a JSON file.
          </p>
          {status === "error" && (
            <p className="mt-2 text-sm text-destructive">
              Couldn’t generate your export. Please try again.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onExport}
          disabled={status === "loading"}
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          {status === "loading" ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Download className="h-4 w-4" aria-hidden />
          )}
          Export
        </button>
      </div>
    </section>
  );
}

function DeleteAccountCard({
  scheduledAt,
  onChange,
}: {
  scheduledAt: string | null;
  onChange: () => Promise<unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const requestDeletion = async () => {
    setBusy(true);
    setError(null);
    try {
      await requestAccountDeletion();
      await onChange();
      setConfirming(false);
    } catch {
      setError("Couldn’t schedule deletion. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const cancelDeletion = async () => {
    setBusy(true);
    setError(null);
    try {
      await cancelAccountDeletion();
      await onChange();
    } catch {
      setError("Couldn’t cancel deletion. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  if (scheduledAt) {
    const when = new Date(scheduledAt).toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    return (
      <section className="rounded-lg border border-destructive/40 bg-destructive/5 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle
            className="mt-0.5 h-5 w-5 text-destructive"
            aria-hidden
          />
          <div className="flex-1">
            <h2 className="font-medium text-destructive">
              Account deletion scheduled
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account and personal data will be permanently anonymized on{" "}
              <span className="font-medium text-foreground">{when}</span>. You
              can cancel any time before then to keep your account.
            </p>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          </div>
          <button
            type="button"
            onClick={cancelDeletion}
            disabled={busy}
            className="inline-flex shrink-0 items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
            Cancel deletion
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="flex items-start gap-3">
        <ShieldX className="mt-0.5 h-5 w-5 text-destructive" aria-hidden />
        <div className="flex-1">
          <h2 className="font-medium">Delete my account</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Request permanent deletion of your account. There is a{" "}
            <span className="font-medium text-foreground">30-day grace period</span>{" "}
            during which you can cancel. After it ends, your personal data is
            anonymized; order records are retained in anonymized form as required
            by law.
          </p>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

          {confirming ? (
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={requestDeletion}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                Confirm deletion
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                Keep my account
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-destructive/50 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
            >
              <ShieldX className="h-4 w-4" aria-hidden />
              Delete my account
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
