/**
 * Change tracking for cloud sync.
 *
 * Database hooks call markDirty() for every local create/update/delete. The
 * set of dirty keys is kept in localStorage (written synchronously), so a
 * change survives the tab closing before it's pushed. At push time the sync
 * engine reads each record's current value — a missing record means "deleted".
 */

const STORAGE_KEY = "p175.sync.dirty";
type DirtyMap = Record<string, number>; // "table:id" -> change counter

let mem: DirtyMap | null = null;
const listeners = new Set<() => void>();
const hasStorage = () => typeof localStorage !== "undefined";

function load(): DirtyMap {
  if (mem) return mem;
  try {
    mem = hasStorage() ? (JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as DirtyMap) : {};
  } catch {
    mem = {};
  }
  return mem;
}

function persist() {
  if (!hasStorage()) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(mem ?? {}));
  } catch {
    /* storage full or blocked — sync will fall back to a full resync */
  }
}

export const dirtyKey = (table: string, id: string) => `${table}:${id}`;

export function splitKey(key: string) {
  const i = key.indexOf(":");
  return { table: key.slice(0, i), id: key.slice(i + 1) };
}

/**
 * Only track while signed in: the first sync after signing in merges
 * everything anyway. The Supabase session lives under this storage key.
 */
export const AUTH_STORAGE_KEY = "p175.auth";
let trackingOverride: boolean | null = null;
export function setTracking(on: boolean | null) {
  trackingOverride = on;
}
function tracking() {
  if (trackingOverride !== null) return trackingOverride;
  try {
    return hasStorage() && localStorage.getItem(AUTH_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function markDirty(table: string, id: string) {
  if (!tracking()) return;
  const m = load();
  const k = dirtyKey(table, id);
  m[k] = (m[k] ?? 0) + 1;
  persist();
  listeners.forEach((l) => l());
}

export function isDirty(table: string, id: string) {
  return dirtyKey(table, id) in load();
}

export function dirtySnapshot(): Array<{ key: string; table: string; id: string; version: number }> {
  return Object.entries(load()).map(([key, version]) => ({ key, version, ...splitKey(key) }));
}

/** Clears pushed keys — unless they changed again while the push was in flight. */
export function clearDirty(entries: Array<{ key: string; version: number }>) {
  const m = load();
  for (const e of entries) if (m[e.key] === e.version) delete m[e.key];
  persist();
}

export function dirtyCount() {
  return Object.keys(load()).length;
}

export function resetDirty() {
  mem = {};
  persist();
}

export function onDirty(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Marker placed on Dexie transactions that apply remote changes, so hooks don't echo them back. */
export const REMOTE_TX_FLAG = "__p175Remote";
export function isRemoteTx(tx: unknown) {
  return !!(tx as Record<string, unknown> | undefined)?.[REMOTE_TX_FLAG];
}
