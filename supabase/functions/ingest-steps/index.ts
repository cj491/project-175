// PROJECT 175 — receive daily step totals from an iPhone Shortcut (Apple Health).
//
// Deploy: supabase functions deploy ingest-steps --no-verify-jwt --use-api
// Call:   GET or POST .../functions/v1/ingest-steps?key=<personal key>&steps=<number>[&date=YYYY-MM-DD|yesterday]
//
// The personal key is created in the app (Activity → Apple Health). Only its
// SHA-256 hash is stored, in public.step_keys.

import { createClient } from "npm:@supabase/supabase-js@2";
import { parseSteps, resolveDate, shouldWrite } from "./parse.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  let params: Record<string, string | null> = { key: url.searchParams.get("key"), steps: url.searchParams.get("steps"), date: url.searchParams.get("date") };
  if (req.method === "POST") {
    try {
      const body = await req.json();
      params = { key: params.key ?? body.key ?? null, steps: params.steps ?? (body.steps != null ? String(body.steps) : null), date: params.date ?? body.date ?? null };
    } catch {
      /* query parameters only */
    }
  }

  if (!params.key || params.key.length < 20) return json({ ok: false, error: "Missing or invalid key" }, 401);
  const steps = parseSteps(params.steps);
  if (steps === null) return json({ ok: false, error: `Couldn't read a step count from "${params.steps ?? ""}"` }, 400);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const hash = await sha256(params.key);
  const { data: keyRow } = await sb.from("step_keys").select("user_id, timezone").eq("key_hash", hash).maybeSingle();
  if (!keyRow) return json({ ok: false, error: "Unknown key — create a new one in PROJECT 175" }, 401);

  const date = resolveDate(params.date, new Date(), keyRow.timezone || "UTC");
  if (!date) return json({ ok: false, error: "Date must be YYYY-MM-DD within the last 7 days" }, 400);

  const { data: existing } = await sb
    .from("records")
    .select("data, deleted")
    .eq("user_id", keyRow.user_id)
    .eq("table_name", "steps")
    .eq("record_id", date)
    .maybeSingle();
  const current = existing && !existing.deleted ? (existing.data as { steps?: number; source?: string }) : null;

  let written = false;
  if (shouldWrite(current, steps)) {
    const { error } = await sb.from("records").upsert(
      {
        user_id: keyRow.user_id,
        table_name: "steps",
        record_id: date,
        data: { date, steps, source: "apple_health", updatedAt: new Date().toISOString() },
        deleted: false,
      },
      { onConflict: "user_id,table_name,record_id" }
    );
    if (error) return json({ ok: false, error: error.message }, 500);
    written = true;
  }
  await sb.from("step_keys").update({ last_used_at: new Date().toISOString(), last_steps: steps }).eq("key_hash", hash);

  return json({ ok: true, date, steps, updated: written, note: written ? undefined : "Kept your manual entry (it's higher)" });
});
