import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Browser shims for the DB + localStorage-backed sync state.
const store = new Map<string, string>();
Object.assign(globalThis, {
  window: globalThis,
  localStorage: {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  },
});

const { syncOnce, resetSyncState } = await import("./engine");
const { getDB } = await import("../db/db");
const repo = await import("../db/repo");
const dirty = await import("./dirty");
dirty.setTracking(true);

/** Minimal in-memory stand-in for the Supabase `records` table, with server-side timestamps. */
interface Row { table_name: string; record_id: string; data: unknown; deleted: boolean; updated_at: string }
function fakeSupabase() {
  const rows = new Map<string, Row>();
  let clock = Date.parse("2026-11-03T12:00:00Z");
  const tick = () => new Date((clock += 1000)).toISOString();
  const client = {
    from() {
      let gte: string | null = null;
      let range: [number, number] = [0, 999];
      const q = {
        select: () => q,
        order: () => q,
        range: (a: number, b: number) => ((range = [a, b]), q),
        gte: (_c: string, v: string) => ((gte = v), q),
        upsert: async (list: Omit<Row, "updated_at">[]) => {
          for (const r of list) rows.set(`${r.table_name}:${r.record_id}`, { ...r, data: structuredClone(r.data), updated_at: tick() });
          return { error: null };
        },
        delete: () => ({ neq: async () => (rows.clear(), { error: null }) }),
        then(resolve: (v: { data: Row[]; error: null }) => void) {
          const all = [...rows.values()].filter((r) => !gte || r.updated_at >= gte).sort((a, b) => a.updated_at.localeCompare(b.updated_at));
          resolve({ data: all.slice(range[0], range[1] + 1).map((r) => structuredClone(r)), error: null });
        },
      };
      return q;
    },
  };
  return { client: client as unknown as SupabaseClient, rows };
}

/** Simulates switching to a different device: empty local DB and no sync state. */
async function freshDevice() {
  await repo.resetAll();
  resetSyncState();
}

describe("cloud sync engine", () => {
  beforeEach(async () => {
    store.clear();
    await freshDevice();
  });

  it("backs up a device, restores it on another, and syncs edits and deletes both ways", async () => {
    const { client, rows } = fakeSupabase();

    // Device A: onboard, log food, earn XP, then sync.
    await repo.completeOnboarding({ profile: { startWeightLb: 205 }, targets: {}, startDate: "2026-11-03" });
    await repo.logFoodItems("2026-11-03", "breakfast", [{ name: "Oats", servingSize: "1", servings: 1, calories: 300, protein: 20, carbs: 40, fat: 6 }]);
    await repo.awardXp({ id: "meal:breakfast:2026-11-03", date: "2026-11-03", type: "meal_breakfast", amount: 10, label: "x" });
    await syncOnce(client, "user-1");
    expect(rows.get("profile:me")).toBeTruthy();
    expect([...rows.keys()].filter((k) => k.startsWith("foodEntries:"))).toHaveLength(1);
    expect(dirty.dirtyCount()).toBe(0);
    const localCountA = await getDB().foods.count();

    // Device B: empty, signs in → everything is restored.
    await freshDevice();
    await syncOnce(client, "user-1");
    const db = getDB();
    expect((await db.profile.get("me"))?.onboarded).toBe(true);
    expect(await db.foods.count()).toBe(localCountA);
    expect(await db.xp.get("meal:breakfast:2026-11-03")).toBeTruthy();
    // Applying remote data must not mark it dirty again (no echo).
    expect(dirty.dirtyCount()).toBe(0);

    // Device B edits and deletes; the next sync pushes both.
    const [entry] = await db.foodEntries.toArray();
    await repo.updateFoodEntry(entry.id, { calories: 350 });
    await repo.setWeight("2026-11-03", 203.4);
    await repo.deleteWeight("2026-11-03");
    await syncOnce(client, "user-1");
    expect((rows.get(`foodEntries:${entry.id}`)?.data as { calories: number }).calories).toBe(350);
    expect(rows.get("weights:2026-11-03")?.deleted).toBe(true);

    // A remote change made elsewhere arrives on the next pull.
    await client.from("records").upsert([{ table_name: "steps", record_id: "2026-11-03", data: { date: "2026-11-03", steps: 9000, source: "manual", updatedAt: "" }, deleted: false }]);
    await syncOnce(client, "user-1");
    expect((await db.steps.get("2026-11-03"))?.steps).toBe(9000);
  });

  it("keeps an XP event unique when two devices earn it offline", async () => {
    const { client, rows } = fakeSupabase();
    const evt = { id: "workout:2026-11-03", date: "2026-11-03", type: "workout", amount: 50, label: "Workout" };
    await repo.awardXp(evt);
    await syncOnce(client, "user-1");
    await freshDevice();
    await repo.awardXp(evt);
    await syncOnce(client, "user-1");
    expect([...rows.keys()].filter((k) => k.startsWith("xp:"))).toEqual(["xp:workout:2026-11-03"]);
    expect(await getDB().xp.count()).toBe(1);
  });

  it("lets the account's profile win over a freshly onboarded device", async () => {
    const { client } = fakeSupabase();
    await repo.completeOnboarding({ profile: { goalWeightLb: 175 }, targets: {}, startDate: "2026-10-01" });
    await syncOnce(client, "user-1");
    await freshDevice();
    await repo.completeOnboarding({ profile: { goalWeightLb: 180 }, targets: {}, startDate: "2026-11-03" });
    await syncOnce(client, "user-1");
    const p = await getDB().profile.get("me");
    expect(p?.startDate).toBe("2026-10-01");
    expect(p?.goalWeightLb).toBe(175);
  });
});
