"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import * as authApi from "@/lib/api/auth";

type Status = "verifying" | "success" | "error" | "missing";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
      <VerifyEmail />
    </Suspense>
  );
}

function VerifyEmail() {
  const search = useSearchParams();
  const token = search.get("token");
  const [status, setStatus] = useState<Status>(token ? "verifying" : "missing");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // guard React 19 double-invoke in dev
    authApi
      .verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <div className="text-center">
      {status === "verifying" && (
        <>
          <h1 className="font-heading text-2xl font-semibold">
            Verifying your email…
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">One moment.</p>
        </>
      )}

      {status === "success" && (
        <>
          <h1 className="font-heading text-2xl font-semibold">Email verified</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is active. You can now sign in.
          </p>
          <Link
            href="/login"
            className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Go to sign in
          </Link>
        </>
      )}

      {(status === "error" || status === "missing") && (
        <>
          <h1 className="font-heading text-2xl font-semibold">
            {status === "missing" ? "No token provided" : "Verification failed"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The link may have expired or already been used. Enter your email to
            get a fresh link.
          </p>

          {resent ? (
            <p className="mt-4 text-sm font-medium text-success">
              If an account exists, a new verification link is on its way.
            </p>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                await authApi.resendVerification(email);
                setResent(true);
              }}
              className="mt-4 flex flex-col gap-2"
            >
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-label="Email"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <button
                type="submit"
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Resend verification link
              </button>
            </form>
          )}

          <Link
            href="/login"
            className="mt-6 inline-block text-sm text-muted-foreground underline"
          >
            Back to sign in
          </Link>
        </>
      )}
    </div>
  );
}
