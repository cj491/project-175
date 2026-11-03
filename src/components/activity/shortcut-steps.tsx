"use client";

import * as React from "react";
import { Check, Copy, Heart, Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/misc";
import { useSync } from "@/components/providers/sync-provider";
import { getSupabase } from "@/lib/sync/supabase";
import { createStepKey, getStepKeys, revokeStepKeys, type StepKeyInfo } from "@/lib/sync/step-shortcut";
import { toast } from "@/lib/events";

function ago(iso: string) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 90) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
}

const STEPS = [
  <>
    Open the <b>Shortcuts</b> app → <b>+</b> → <b>Add Action</b> → search <b>Find Health Samples</b>.
  </>,
  <>
    Set it to <b>Steps</b>, tap <b>Add Filter</b> → <b>Start Date</b> <b>is today</b>, then set <b>Group By</b> to <b>Day</b>.
  </>,
  <>
    Add the action <b>Get Contents of URL</b>. Paste your link into the URL, then tap right after <code>steps=</code> and insert the <b>Health Samples</b> variable.
  </>,
  <>
    Name it <b>P175 Steps</b> and tap ▶︎ once. Allow access to Health and to the internet. The app should show the update within a minute.
  </>,
  <>
    <b>Automation</b> tab → <b>+</b> → <b>Time of Day</b> → e.g. 12:00, Daily → <b>Run Immediately</b> → pick <b>P175 Steps</b>. Repeat for 6 pm, 9 pm and 11:50 pm.
  </>,
];

/** Apple Health steps via an iPhone Shortcut — works in the web app, no native build needed. */
export function ShortcutStepsCard() {
  const sync = useSync();
  const [keys, setKeys] = React.useState<StepKeyInfo[] | null>(null);
  const [url, setUrl] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const sb = getSupabase();
    if (!sb || !sync.userId) return setKeys(null);
    try {
      setKeys(await getStepKeys(sb));
    } catch {
      setKeys([]);
    }
  }, [sync.userId]);

  React.useEffect(() => {
    void refresh();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);

  const create = async () => {
    const sb = getSupabase();
    if (!sb) return;
    if (keys?.length && !confirm("Create a new link? Your current Shortcut will stop working until you paste the new one.")) return;
    setBusy(true);
    try {
      setUrl(await createStepKey(sb));
      setCopied(false);
      await refresh();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't create the link", detail: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    const sb = getSupabase();
    if (!sb || !confirm("Disconnect? Your Shortcut will stop updating steps. Steps already imported are kept.")) return;
    await revokeStepKeys(sb);
    setUrl(null);
    await refresh();
    toast({ kind: "info", title: "Apple Health Shortcut disconnected" });
  };

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ kind: "success", title: "Link copied", detail: "Paste it into the Shortcut's URL field" });
    } catch {
      toast({ kind: "info", title: "Select the link and copy it manually" });
    }
  };

  const key = keys?.[0];
  return (
    <Card>
      <div className="mb-3 flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose/10 text-rose">
          <Heart size={18} fill="currentColor" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium">Apple Health via Shortcuts</p>
          <p className="text-xs text-subtle">
            {!sync.configured || !sync.userId
              ? "Sign in to cloud sync (Profile) to use this"
              : key?.last_used_at
                ? `Last update ${ago(key.last_used_at)} · ${key.last_steps?.toLocaleString() ?? 0} steps`
                : key
                  ? "Link created — waiting for the first upload"
                  : "Not connected"}
          </p>
        </div>
        {key?.last_used_at && <Chip tone="emerald">Connected</Chip>}
      </div>

      {sync.userId && (
        <>
          {url ? (
            <div className="space-y-3">
              <div className="rounded-2xl border border-lime/30 bg-lime/5 p-3">
                <p className="mb-1.5 text-xs font-medium text-lime">Your personal link — shown once, keep it private</p>
                <p className="break-all font-mono text-[11px] leading-relaxed text-muted select-all">{url}</p>
                <Button className="mt-3 w-full" onClick={copy}>
                  {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copied" : "Copy link"}
                </Button>
              </div>
              <ol className="list-decimal space-y-2 pl-5 text-sm text-muted">
                {STEPS.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={create} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : key ? <RefreshCw size={16} /> : <Link2 size={16} />} {key ? "New Shortcut link" : "Set up with Shortcuts"}
              </Button>
              {key && (
                <Button variant="secondary" onClick={disconnect} aria-label="Disconnect Shortcut">
                  <Unlink size={16} />
                </Button>
              )}
            </div>
          )}
          <p className="mt-3 text-xs leading-relaxed text-subtle">
            The Shortcut reads today&apos;s step total from Apple Health on your iPhone and sends only that number. Days you entered manually are only replaced when Health counted more.
          </p>
        </>
      )}
    </Card>
  );
}
