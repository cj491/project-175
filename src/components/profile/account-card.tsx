"use client";

import * as React from "react";
import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented } from "@/components/ui/form";
import { Chip } from "@/components/ui/misc";
import { useSync } from "@/components/providers/sync-provider";
import { toast } from "@/lib/events";
import { z } from "zod";

const credsSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

function relTime(iso: string | null) {
  if (!iso) return "never";
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

export function AuthForm({ onDone, intro }: { onDone?: () => void; intro?: React.ReactNode }) {
  const sync = useSync();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setNotice(null);
    const r = credsSchema.safeParse({ email, password });
    if (!r.success) return setError(r.error.issues[0].message);
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        const err = await sync.signIn(r.data.email, r.data.password);
        if (err) return setError(err);
        toast({ kind: "success", title: "Signed in", detail: "Syncing your data…" });
        onDone?.();
      } else {
        const { error: err, needsConfirmation } = await sync.signUp(r.data.email, r.data.password);
        if (err) return setError(err);
        if (needsConfirmation) setNotice("Check your inbox to confirm your email, then sign in here.");
        else {
          toast({ kind: "success", title: "Account created", detail: "Your data is now backed up" });
          onDone?.();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      {intro}
      <Segmented<"signin" | "signup">
        value={mode}
        onChange={(m) => {
          setMode(m);
          setError(null);
          setNotice(null);
        }}
        options={[
          { value: "signin", label: "Sign in" },
          { value: "signup", label: "Create account" },
        ]}
        size="sm"
      />
      <Field label="Email" htmlFor="auth-email">
        <Input id="auth-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" hint={mode === "signup" ? "At least 8 characters" : undefined} htmlFor="auth-pass">
        <Input id="auth-pass" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="text-sm text-rose">{error}</p>}
      {notice && <p className="rounded-2xl bg-lime/10 px-3 py-2.5 text-sm text-lime">{notice}</p>}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 size={16} className="animate-spin" />} {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
      {mode === "signin" && (
        <button
          type="button"
          className="w-full text-center text-xs text-subtle hover:text-fg"
          onClick={async () => {
            const r = z.string().email().safeParse(email.trim());
            if (!r.success) return setError("Enter your email first");
            const err = await sync.resetPassword(r.data);
            if (err) setError(err);
            else setNotice("Password reset email sent.");
          }}
        >
          Forgot password?
        </button>
      )}
    </form>
  );
}

export function AccountCard() {
  const sync = useSync();
  const [busy, setBusy] = React.useState(false);

  if (!sync.configured) {
    return (
      <Card>
        <CardHeader title="Cloud backup & sync" subtitle="Not set up — your data lives only in this browser" icon={<CloudOff size={16} />} />
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted">
          <li>Create a free project at supabase.com.</li>
          <li>
            Run <code className="rounded bg-surface-3 px-1 text-xs">supabase/migrations/0001_project175.sql</code> in its SQL editor.
          </li>
          <li>
            Add the project URL and anon key to <code className="rounded bg-surface-3 px-1 text-xs">.env.local</code> (see <code className="rounded bg-surface-3 px-1 text-xs">.env.example</code>) and restart the app.
          </li>
        </ol>
        <p className="mt-3 text-xs text-subtle">Until then, use Export backup below to keep a copy of your data.</p>
      </Card>
    );
  }

  if (!sync.userId) {
    return (
      <Card>
        <CardHeader title="Cloud backup & sync" subtitle="Sign in to back up and use PROJECT 175 on all your devices" icon={<Cloud size={16} />} />
        <AuthForm intro={<p className="text-xs text-subtle">Your existing data on this device is merged into your account. Progress photos always stay on this device.</p>} />
      </Card>
    );
  }

  const statusChip =
    sync.status === "syncing" ? (
      <Chip>
        <Loader2 size={12} className="animate-spin" /> Syncing
      </Chip>
    ) : sync.status === "error" ? (
      <Chip tone="rose">
        <AlertTriangle size={12} /> Sync error
      </Chip>
    ) : sync.status === "offline" ? (
      <Chip tone="amber">Offline — will sync later</Chip>
    ) : (
      <Chip tone="emerald">
        <CheckCircle2 size={12} /> Synced
      </Chip>
    );

  return (
    <Card>
      <CardHeader title="Cloud backup & sync" subtitle={sync.email ?? ""} icon={<Cloud size={16} />} action={statusChip} />
      <p className="text-sm text-muted">
        Last synced {relTime(sync.lastSynced)}
        {sync.pending > 0 && ` · ${sync.pending} change${sync.pending > 1 ? "s" : ""} waiting`}
      </p>
      {sync.error && <p className="mt-2 text-sm text-rose">{sync.error}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => sync.syncNow()} disabled={sync.status === "syncing"}>
          <RefreshCw size={16} /> Sync now
        </Button>
        <Button
          variant="secondary"
          onClick={async () => {
            await sync.signOut();
            toast({ kind: "info", title: "Signed out", detail: "Your data stays on this device" });
          }}
        >
          <LogOut size={16} /> Sign out
        </Button>
        <Button
          variant="danger"
          disabled={busy}
          onClick={async () => {
            if (!confirm("Delete your cloud copy? Data on this device is kept, but other devices will stop syncing it.")) return;
            setBusy(true);
            const err = await sync.deleteCloud();
            setBusy(false);
            toast(err ? { kind: "error", title: "Couldn't delete cloud data", detail: err } : { kind: "success", title: "Cloud copy deleted" });
          }}
        >
          <Trash2 size={16} /> Delete cloud copy
        </Button>
      </div>
      <p className="mt-3 text-xs text-subtle">Only you can read your synced data (enforced by database row-level security). Progress photos are never uploaded.</p>
    </Card>
  );
}
