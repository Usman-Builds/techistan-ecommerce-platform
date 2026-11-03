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
  useSyncExternalStore,
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

// localStorage-backed store read via useSyncExternalStore. `memory` keeps the
// choice for this tab when storage is unavailable (private mode / disabled).
let memory: ConsentState = null;
const listeners = new Set<() => void>();

function readConsent(): ConsentState {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "granted" || stored === "denied") return stored;
  } catch {
    // ignore (private mode / storage disabled)
  }
  return memory;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

const serverConsent = (): ConsentState => null;
const noopSubscribe = () => () => {};

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const consent = useSyncExternalStore(subscribe, readConsent, serverConsent);
  const ready = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  const persist = useCallback((value: Exclude<ConsentState, null>) => {
    memory = value;
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // ignore
    }
    listeners.forEach((l) => l());
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
