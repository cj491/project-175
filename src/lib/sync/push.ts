import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Background reminders via Web Push. The browser subscription is stored in
 * Supabase; the send-reminders edge function checks each user's reminder
 * times (in their timezone) and sends a push only if the reminder is still
 * relevant — e.g. no protein nudge once you've hit your target.
 */
const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";
const FLAG = "p175.push.enabled";

export const PUSH_AVAILABLE = Boolean(VAPID_PUBLIC);

export function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function pushEnabledLocally() {
  try {
    return localStorage.getItem(FLAG) === "1";
  } catch {
    return false;
  }
}

function toUint8(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function enablePush(supabase: SupabaseClient): Promise<string | null> {
  if (!PUSH_AVAILABLE) return "Push isn't configured (missing NEXT_PUBLIC_VAPID_PUBLIC_KEY)";
  if (!pushSupported()) return "This browser doesn't support background notifications. On iPhone, add the app to your Home Screen first.";
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return "Notifications are blocked in your browser settings";
  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toUint8(VAPID_PUBLIC) }));
  const json = sub.toJSON();
  const { error } = await supabase.from("push_subscriptions").upsert(
    { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    { onConflict: "endpoint" }
  );
  if (error) return `Couldn't save the subscription: ${error.message}`;
  localStorage.setItem(FLAG, "1");
  return null;
}

export async function disablePush(supabase: SupabaseClient | null) {
  localStorage.removeItem(FLAG);
  const reg = await navigator.serviceWorker?.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase?.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
