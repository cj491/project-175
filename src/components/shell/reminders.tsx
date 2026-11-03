"use client";

import * as React from "react";
import { useAppData } from "@/components/providers/data-provider";
import { reminderMessage } from "@/lib/domain/analytics";
import { toast } from "@/lib/events";
import { pushEnabledLocally } from "@/lib/sync/push";

const FIRED_KEY = "p175.reminders.fired";

function firedToday(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(FIRED_KEY) || "{}");
  } catch {
    return {};
  }
}

/**
 * In-app reminder scheduler.
 *
 * While the app is open (or installed and running), it checks once a minute
 * whether a reminder is due and, if it's still relevant (e.g. protein not yet
 * hit), shows a system notification (if permitted) and an in-app toast.
 * Each reminder fires at most once per day and is skipped if already done —
 * no nagging. True background push needs a server and is not included.
 */
export function ReminderScheduler() {
  const { data, today } = useAppData();
  const ref = React.useRef(data);
  React.useEffect(() => {
    ref.current = data;
  }, [data]);

  React.useEffect(() => {
    const tick = () => {
      const d = ref.current;
      if (!d?.profile?.onboarded) return;
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const fired = firedToday();
      for (const r of d.profile.reminders) {
        if (!r.enabled || r.time > hhmm) continue;
        // Only fire within 30 minutes after the scheduled time.
        const [h, m] = r.time.split(":").map(Number);
        const mins = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
        if (mins > 30 || fired[r.id] === today) continue;
        fired[r.id] = today;
        const msg = r.kind === "custom" ? r.label : reminderMessage(r.kind, d, today);
        if (!msg) continue;
        toast({ kind: "info", title: msg });
        // When background push is on, the server sends the system notification — don't double up.
        if (!pushEnabledLocally() && d.profile.notificationsEnabled && "Notification" in window && Notification.permission === "granted") {
          navigator.serviceWorker?.getRegistration().then((reg) => {
            if (reg) reg.showNotification("PROJECT 175", { body: msg, icon: "/icon-192.png", tag: r.id });
            else new Notification("PROJECT 175", { body: msg, icon: "/icon-192.png", tag: r.id });
          });
        }
      }
      try {
        localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
      } catch {}
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [today]);

  return null;
}

export function ServiceWorkerRegistrar() {
  React.useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW registration failed", e));
    }
  }, []);
  return null;
}
