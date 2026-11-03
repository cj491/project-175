import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Personal links that let an iPhone Shortcut upload today's step total from
 * Apple Health. The key is shown once; only its SHA-256 hash is stored.
 */
export interface StepKeyInfo {
  created_at: string;
  last_used_at: string | null;
  last_steps: number | null;
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

async function sha256Hex(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function shortcutUrl(key: string) {
  return `${SUPABASE_URL}/functions/v1/ingest-steps?key=${key}&steps=`;
}

export async function getStepKeys(supabase: SupabaseClient): Promise<StepKeyInfo[]> {
  const { data, error } = await supabase.from("step_keys").select("created_at, last_used_at, last_steps").order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as StepKeyInfo[];
}

/** Replaces any existing link with a new one and returns the full URL (shown once). */
export async function createStepKey(supabase: SupabaseClient): Promise<string> {
  await revokeStepKeys(supabase);
  const key = randomKey();
  const { error } = await supabase.from("step_keys").insert({ key_hash: await sha256Hex(key), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone });
  if (error) throw new Error(error.message);
  return shortcutUrl(key);
}

export async function revokeStepKeys(supabase: SupabaseClient) {
  const { error } = await supabase.from("step_keys").delete().neq("key_hash", "");
  if (error) throw new Error(error.message);
}
