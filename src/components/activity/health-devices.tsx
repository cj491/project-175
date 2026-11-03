"use client";

import * as React from "react";
import { Loader2, RefreshCw, Smartphone, Watch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/misc";
import { useAppData } from "@/components/providers/data-provider";
import { disconnectHealth, getHealthProvider, HEALTH_PROVIDERS, type HealthProvider, type HealthStatus } from "@/lib/integrations/health";
import { importHealthSteps } from "@/lib/db/repo";
import { addDays } from "@/lib/dates";
import { toast } from "@/lib/events";

async function syncSteps(p: HealthProvider, today: string, days: number) {
  const list = await p.fetchDays(addDays(today, -(days - 1)), today);
  return importHealthSteps(list, p.id);
}

function useNativeHealth() {
  const [provider, setProvider] = React.useState<HealthProvider | null>(null);
  const [status, setStatus] = React.useState<HealthStatus>("unavailable");
  const refresh = React.useCallback(async () => {
    const p = await getHealthProvider();
    setProvider(p);
    setStatus(p ? await p.status() : "unavailable");
  }, []);
  React.useEffect(() => {
    void refresh();
  }, [refresh]);
  return { provider, status, refresh };
}

/** Pulls the last week of steps when the native app opens or comes back to the foreground. */
export function HealthAutoSync() {
  const { today } = useAppData();
  const { provider, status } = useNativeHealth();
  React.useEffect(() => {
    if (!provider || status !== "connected") return;
    const run = () => syncSteps(provider, today, 7).catch((e) => console.warn("Health sync failed", e));
    void run();
    const onVis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [provider, status, today]);
  return null;
}

export function HealthDevicesCard() {
  const { today } = useAppData();
  const { provider, status, refresh } = useNativeHealth();
  const [busy, setBusy] = React.useState(false);

  const connect = async () => {
    if (!provider) return;
    setBusy(true);
    try {
      const ok = await provider.requestPermission();
      if (!ok) return toast({ kind: "info", title: "Permission not granted", detail: `Allow step access in ${provider.label} settings to sync.` });
      const n = await syncSteps(provider, today, 30);
      toast({ kind: "success", title: `${provider.label} connected`, detail: `${n} day${n === 1 ? "" : "s"} of steps imported` });
      await refresh();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't connect", detail: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const syncNow = async () => {
    if (!provider) return;
    setBusy(true);
    try {
      const n = await syncSteps(provider, today, 14);
      toast({ kind: "success", title: "Steps synced", detail: n ? `${n} day${n === 1 ? "" : "s"} updated` : "Already up to date" });
    } catch (e) {
      toast({ kind: "error", title: "Sync failed", detail: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const rows = provider ? [provider] : HEALTH_PROVIDERS;
  return (
    <Card>
      <ul className="space-y-3">
        {rows.map((p) => {
          const native = p === provider;
          const st = native ? status : "unavailable";
          return (
            <li key={p.id} className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-surface-3 text-muted">{p.id === "apple_health" ? <Watch size={18} /> : <Smartphone size={18} />}</div>
              <div className="min-w-0 flex-1">
                <p className="font-medium">{p.label}</p>
                <p className="text-xs text-subtle">{st === "connected" ? "Connected · steps sync automatically" : st === "disconnected" ? "Available — not connected" : native ? "Not available on this device" : "Not connected"}</p>
              </div>
              {native && st === "disconnected" && (
                <Button size="sm" onClick={connect} disabled={busy}>
                  {busy && <Loader2 size={14} className="animate-spin" />} Connect
                </Button>
              )}
              {native && st === "connected" && (
                <Button variant="secondary" size="sm" onClick={syncNow} disabled={busy} aria-label="Sync steps now">
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </Button>
              )}
              {!native && <Chip>Native app only</Chip>}
            </li>
          );
        })}
      </ul>
      {provider && status === "connected" ? (
        <button
          type="button"
          className="mt-3 text-xs text-subtle hover:text-fg"
          onClick={async () => {
            disconnectHealth();
            await refresh();
          }}
        >
          Stop syncing (imported days are kept)
        </button>
      ) : (
        <p className="mt-4 text-xs leading-relaxed text-subtle">
          {provider
            ? "Steps are read only — PROJECT 175 never writes to your health data. Days you entered manually are only replaced if the device counted more steps."
            : "Apple Health and Health Connect only work in the PROJECT 175 mobile app (Capacitor build). In the browser, enter steps manually — nothing is imported."}
        </p>
      )}
    </Card>
  );
}
