import Dexie from "dexie";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getDB, SYNCED_TABLES } from "../db/db";
import { clearDirty, dirtyKey, dirtySnapshot, isDirty, markDirty, REMOTE_TX_FLAG, resetDirty } from "./dirty";

/**
 * Two-way sync between IndexedDB and the Supabase `records` table.
 *
 *  1. First sync on a device for a user: pull everything and merge by record
 *     timestamp (newest wins). Profile, targets and workout templates from the
 *     account win over a fresh device so you don't overwrite your setup.
 *  2. Every sync after that: push locally changed records, then pull rows
 *     changed on the server since the last pull. Records with unpushed local
 *     changes are skipped during the pull — they'll be pushed next time.
 */

const META_KEY = "p175.sync.meta";
const PAGE = 1000;
const PULL_OVERLAP_MS = 60_000; // re-read a minute back to cover commit ordering
const REMOTE_WINS_ON_FIRST_SYNC = new Set(["profile", "targets", "templates"]);

interface Meta {
  userId: string | null;
  lastPulledAt: string | null;
}

interface RemoteRow {
  table_name: string;
  record_id: string;
  data: Record<string, unknown> | null;
  deleted: boolean;
  updated_at: string;
}

function readMeta(): Meta {
  try {
    return { userId: null, lastPulledAt: null, ...JSON.parse(localStorage.getItem(META_KEY) || "{}") };
  } catch {
    return { userId: null, lastPulledAt: null };
  }
}
function writeMeta(m: Meta) {
  localStorage.setItem(META_KEY, JSON.stringify(m));
}

export function resetSyncState() {
  localStorage.removeItem(META_KEY);
  resetDirty();
}

export function lastSyncedAt() {
  return readMeta().lastPulledAt;
}

const recordTime = (r: Record<string, unknown> | null | undefined) =>
  String(r?.updatedAt ?? r?.createdAt ?? r?.unlockedAt ?? r?.loggedAt ?? "");

const tableNames = new Set<string>(SYNCED_TABLES);

async function pullSince(supabase: SupabaseClient, since: string | null): Promise<RemoteRow[]> {
  const out: RemoteRow[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from("records").select("table_name, record_id, data, deleted, updated_at").order("updated_at", { ascending: true }).range(from, from + PAGE - 1);
    if (since) q = q.gte("updated_at", new Date(new Date(since).getTime() - PULL_OVERLAP_MS).toISOString());
    const { data, error } = await q;
    if (error) throw new Error(`Pull failed: ${error.message}`);
    out.push(...((data ?? []) as RemoteRow[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** Applies remote rows locally without marking them dirty again. */
async function applyRemote(rows: RemoteRow[], decide: (row: RemoteRow, local: Record<string, unknown> | undefined) => "apply" | "keep-local" | "skip") {
  const db = getDB();
  let applied = 0;
  await db.transaction("rw", SYNCED_TABLES.map((t) => db.table(t)), async () => {
    (Dexie.currentTransaction as unknown as Record<string, unknown>)[REMOTE_TX_FLAG] = true;
    for (const row of rows) {
      if (!tableNames.has(row.table_name)) continue;
      const table = db.table(row.table_name);
      const local = (await table.get(row.record_id)) as Record<string, unknown> | undefined;
      const d = decide(row, local);
      if (d === "keep-local") {
        markDirty(row.table_name, row.record_id);
        continue;
      }
      if (d === "skip") continue;
      if (row.deleted || !row.data) await table.delete(row.record_id);
      else await table.put(row.data);
      applied++;
    }
  });
  return applied;
}

async function push(supabase: SupabaseClient) {
  const db = getDB();
  const entries = dirtySnapshot().filter((e) => tableNames.has(e.table));
  let pushed = 0;
  for (let i = 0; i < entries.length; i += 200) {
    const chunk = entries.slice(i, i + 200);
    const rows = await Promise.all(
      chunk.map(async (e) => {
        const value = await db.table(e.table).get(e.id);
        return { table_name: e.table, record_id: e.id, data: value ?? null, deleted: value === undefined };
      })
    );
    const { error } = await supabase.from("records").upsert(rows, { onConflict: "user_id,table_name,record_id" });
    if (error) throw new Error(`Push failed: ${error.message}`);
    clearDirty(chunk);
    pushed += rows.length;
  }
  return pushed;
}

export interface SyncResult {
  pushed: number;
  pulled: number;
  at: string;
}

export async function syncOnce(supabase: SupabaseClient, userId: string): Promise<SyncResult> {
  const meta = readMeta();
  const db = getDB();
  let pulled = 0;

  if (meta.userId !== userId || !meta.lastPulledAt) {
    // First sync for this account on this device: merge everything.
    const remote = await pullSince(supabase, null);
    const remoteKeys = new Set(remote.map((r) => dirtyKey(r.table_name, r.record_id)));
    pulled = await applyRemote(remote, (row, local) => {
      if (!local) return "apply";
      if (REMOTE_WINS_ON_FIRST_SYNC.has(row.table_name)) return "apply";
      return recordTime(local) > recordTime(row.data) ? "keep-local" : "apply";
    });
    // Local-only records need to go up.
    for (const t of SYNCED_TABLES) {
      const table = db.table(t);
      const pk = table.schema.primKey.keyPath as string;
      const rows = (await table.toArray()) as Record<string, unknown>[];
      for (const r of rows) if (!remoteKeys.has(dirtyKey(t, String(r[pk])))) markDirty(t, String(r[pk]));
    }
    await push(supabase);
    const at = remote.length ? remote[remote.length - 1].updated_at : new Date().toISOString();
    writeMeta({ userId, lastPulledAt: at });
    return { pushed: 0, pulled, at };
  }

  const pushed = await push(supabase);
  const remote = await pullSince(supabase, meta.lastPulledAt);
  pulled = await applyRemote(remote, (row, local) => {
    if (isDirty(row.table_name, row.record_id)) return "skip";
    if (local && !row.deleted && JSON.stringify(local) === JSON.stringify(row.data)) return "skip";
    return "apply";
  });
  const at = remote.length ? remote[remote.length - 1].updated_at : meta.lastPulledAt;
  writeMeta({ userId, lastPulledAt: at });
  return { pushed, pulled, at };
}

/** Deletes this account's cloud copy (local data is untouched). */
export async function deleteCloudData(supabase: SupabaseClient) {
  const { error } = await supabase.from("records").delete().neq("record_id", "");
  if (error) throw new Error(error.message);
  await supabase.from("push_subscriptions").delete().neq("endpoint", "");
  resetSyncState();
}
