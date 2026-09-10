"use client";

/**
 * Cookie-consent state (script 17, CR-005). Persisted client-side in
 * localStorage. `null` = the visitor hasn't chosen yet (banner shows);
 * `"granted"`/`"denied"` = their decision. Cookie-setting analytics (GA4) only
 * initialize when this is `"granted"`; cookieless Plausible ignores it.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type ConsentState = "granted" | "denied" | null;

const STORAGE_KEY = "sf.cookie-consent";

type ConsentContextValue = {
  consent: ConsentState;
  ready: boolean; // hydration guard — false until localStorage is read
  accept: () => void;
  reject: () => void;
};

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "granted" || stored === "denied") setConsent(stored);
    } catch {
      // ignore (private mode / storage disabled)
    }
    setReady(true);
  }, []);

  const persist = useCallback((value: Exclude<ConsentState, null>) => {
    setConsent(value);
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }, []);

  const value: ConsentContextValue = {
    consent,
    ready,
    accept: useCallback(() => persist("granted"), [persist]),
    reject: useCallback(() => persist("denied"), [persist]),
  };

  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

export function useConsent(): ConsentContextValue {
  const ctx = useContext(ConsentContext);
  if (!ctx) throw new Error("useConsent must be used within a ConsentProvider");
  return ctx;
}
