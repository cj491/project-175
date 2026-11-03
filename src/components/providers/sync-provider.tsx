"use client";

import * as React from "react";
import type { Session } from "@supabase/supabase-js";
import { CLOUD_CONFIGURED, getSupabase } from "@/lib/sync/supabase";
import { deleteCloudData, lastSyncedAt, resetSyncState, syncOnce } from "@/lib/sync/engine";
import { dirtyCount, onDirty } from "@/lib/sync/dirty";

export type SyncStatus = "disabled" | "signed-out" | "idle" | "syncing" | "offline" | "error";

interface SyncCtx {
  configured: boolean;
  status: SyncStatus;
  email: string | null;
  userId: string | null;
  lastSynced: string | null;
  pending: number;
  error: string | null;
  syncNow: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirmation: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  deleteCloud: () => Promise<string | null>;
}

const Ctx = React.createContext<SyncCtx | null>(null);
const DEBOUNCE_MS = 4000;
const INTERVAL_MS = 5 * 60_000;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const supabase = getSupabase();
  const [session, setSession] = React.useState<Session | null>(null);
  const [status, setStatus] = React.useState<SyncStatus>(CLOUD_CONFIGURED ? "signed-out" : "disabled");
  const [error, setError] = React.useState<string | null>(null);
  const [lastSynced, setLastSynced] = React.useState<string | null>(() => (CLOUD_CONFIGURED ? lastSyncedAt() : null));
  const [pending, setPending] = React.useState(0);
  const running = React.useRef(false);
  const again = React.useRef(false);
  const userId = session?.user.id ?? null;

  React.useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const syncNow = React.useCallback(async () => {
    if (!supabase || !userId) return;
    if (!navigator.onLine) {
      setStatus("offline");
      return;
    }
    if (running.current) {
      again.current = true;
      return;
    }
    running.current = true;
    setStatus("syncing");
    try {
      do {
        again.current = false;
        const r = await syncOnce(supabase, userId);
        setLastSynced(r.at);
      } while (again.current);
      setError(null);
      setStatus("idle");
    } catch (e) {
      setError((e as Error).message);
      setStatus("error");
    } finally {
      running.current = false;
      setPending(dirtyCount());
    }
  }, [supabase, userId]);

  // Sync on sign-in, on changes (debounced), on focus/online, and periodically.
  React.useEffect(() => {
    if (!supabase) return;
    if (!userId) {
      setStatus("signed-out");
      return;
    }
    void syncNow();
    let t: ReturnType<typeof setTimeout> | null = null;
    const off = onDirty(() => {
      setPending(dirtyCount());
      if (t) clearTimeout(t);
      t = setTimeout(() => void syncNow(), DEBOUNCE_MS);
    });
    const kick = () => void syncNow();
    const onVis = () => document.visibilityState === "visible" && kick();
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", onVis);
    const iv = setInterval(kick, INTERVAL_MS);
    return () => {
      off();
      if (t) clearTimeout(t);
      clearInterval(iv);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [supabase, userId, syncNow]);

  const value = React.useMemo<SyncCtx>(
    () => ({
      configured: CLOUD_CONFIGURED,
      status,
      email: session?.user.email ?? null,
      userId,
      lastSynced,
      pending,
      error,
      syncNow,
      signIn: async (email, password) => {
        if (!supabase) return "Cloud sync isn't configured";
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        return error?.message ?? null;
      },
      signUp: async (email, password) => {
        if (!supabase) return { error: "Cloud sync isn't configured", needsConfirmation: false };
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        return { error: error?.message ?? null, needsConfirmation: !error && !data.session };
      },
      resetPassword: async (email) => {
        if (!supabase) return "Cloud sync isn't configured";
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/profile` });
        return error?.message ?? null;
      },
      signOut: async () => {
        if (!supabase) return;
        await syncNow().catch(() => {});
        await supabase.auth.signOut();
        resetSyncState();
        setLastSynced(null);
      },
      deleteCloud: async () => {
        if (!supabase) return "Cloud sync isn't configured";
        try {
          await deleteCloudData(supabase);
          await supabase.auth.signOut();
          setLastSynced(null);
          return null;
        } catch (e) {
          return (e as Error).message;
        }
      },
    }),
    [status, session, userId, lastSynced, pending, error, syncNow, supabase]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSync() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useSync must be used inside SyncProvider");
  return c;
}
