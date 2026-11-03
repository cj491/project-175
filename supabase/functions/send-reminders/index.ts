// PROJECT 175 — background reminders (Supabase Edge Function, Deno).
//
// Deploy:   supabase functions deploy send-reminders --no-verify-jwt
// Secrets:  supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... VAPID_SUBJECT=mailto:you@example.com CRON_SECRET=<random string>
// Schedule: run supabase/migrations/0002_reminder_cron.sql (calls this every 5 minutes).
//
// For each user with a push subscription it finds reminders due in their
// timezone, skips ones that no longer apply (protein already hit, workout
// done…) and ones already sent today, then sends a web push.

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { dueReminders, localNow, reminderText, type Reminder, type UserDay } from "./relevance.ts";

type Rec = { table_name: string; record_id: string; data: Record<string, unknown> | null };

Deno.serve(async (req) => {
  if (req.headers.get("x-cron-secret") !== Deno.env.get("CRON_SECRET")) return new Response("Forbidden", { status: 403 });

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  webpush.setVapidDetails(Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@example.com", Deno.env.get("VAPID_PUBLIC_KEY")!, Deno.env.get("VAPID_PRIVATE_KEY")!);

  const { data: subs, error } = await sb.from("push_subscriptions").select("endpoint, user_id, p256dh, auth, timezone");
  if (error) return new Response(error.message, { status: 500 });

  const byUser = new Map<string, typeof subs>();
  for (const s of subs ?? []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  const now = new Date();
  for (const [userId, userSubs] of byUser) {
    try {
      const { date, minutes, weekday } = localNow(now, userSubs[0].timezone || "UTC");
      const { data: prof } = await sb.from("records").select("data").eq("user_id", userId).eq("table_name", "profile").eq("record_id", "me").eq("deleted", false).maybeSingle();
      const profile = prof?.data as { reminders?: Reminder[]; schedule?: UserDay["schedule"]; notificationsEnabled?: boolean } | undefined;
      if (!profile?.reminders || profile.notificationsEnabled === false) continue;
      const due = dueReminders(profile.reminders, minutes);
      if (!due.length) continue;

      // Today's records for relevance checks.
      const [{ data: dayRows }, { data: targetRows }, { data: keyed }] = await Promise.all([
        sb.from("records").select("table_name, record_id, data").eq("user_id", userId).eq("deleted", false).in("table_name", ["foodEntries", "water", "sessions"]).eq("data->>date", date),
        sb.from("records").select("data").eq("user_id", userId).eq("table_name", "targets").eq("deleted", false),
        sb.from("records").select("table_name, record_id, data").eq("user_id", userId).eq("deleted", false).in("table_name", ["steps", "checkins"]).eq("record_id", date),
      ]);
      const rows = (dayRows ?? []) as Rec[];
      const sum = (table: string, field: string) => rows.filter((r) => r.table_name === table).reduce((a, r) => a + Number(r.data?.[field] ?? 0), 0);
      const targets = ((targetRows ?? []) as { data: Record<string, unknown> }[])
        .map((r) => r.data)
        .filter((t) => String(t.effectiveFrom) <= date)
        .sort((a, b) => String(a.effectiveFrom).localeCompare(String(b.effectiveFrom)))
        .at(-1) as UserDay["targets"] | undefined;
      const day: UserDay = {
        reminders: profile.reminders,
        schedule: profile.schedule ?? [],
        targets: targets ?? null,
        protein: sum("foodEntries", "protein"),
        waterMl: sum("water", "ml"),
        steps: Number(((keyed ?? []) as Rec[]).find((r) => r.table_name === "steps")?.data?.steps ?? 0),
        workoutDone: rows.some((r) => r.table_name === "sessions" && r.data?.status === "completed"),
        checkedIn: ((keyed ?? []) as Rec[]).some((r) => r.table_name === "checkins"),
      };

      for (const r of due) {
        const body = reminderText(r, day, weekday);
        if (!body) continue;
        // Claim the send first; the primary key stops a second send today.
        const { error: logErr } = await sb.from("reminder_log").insert({ user_id: userId, reminder_id: r.id, local_date: date });
        if (logErr) continue;
        const url = r.kind === "workout" ? "/training" : r.kind === "checkin" ? "/" : r.kind === "steps" ? "/activity" : "/nutrition";
        for (const s of userSubs) {
          try {
            await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify({ title: "PROJECT 175", body, tag: r.id, url }));
            sent++;
          } catch (e) {
            const code = (e as { statusCode?: number }).statusCode;
            if (code === 404 || code === 410) await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      }
    } catch (e) {
      console.error("reminders failed for user", userId, e);
    }
  }
  return Response.json({ ok: true, sent });
});
