import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AUTH_STORAGE_KEY } from "./dirty";

/**
 * Supabase browser client. Returns null until NEXT_PUBLIC_SUPABASE_URL and
 * NEXT_PUBLIC_SUPABASE_ANON_KEY are set — the app then stays fully local.
 *
 * The anon/publishable key is designed to be public; Row Level Security on
 * the database is what keeps each user's data private. Never put the
 * service-role key in the app.
 */
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const CLOUD_CONFIGURED = Boolean(URL && KEY);

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (!CLOUD_CONFIGURED || typeof window === "undefined") return null;
  if (!client) {
    client = createClient(URL!, KEY!, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: AUTH_STORAGE_KEY },
    });
  }
  return client;
}
