import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";

// The DB module refuses to run outside a browser; give it a window.
(globalThis as unknown as { window: unknown }).window = globalThis;

const { awardXp, completeOnboarding, deleteFoodEntry, logFoodItems, saveTargets, resetAll, setSteps, importHealthSteps } = await import("./repo");
const { getDB } = await import("./db");

describe("repository", () => {
  beforeEach(async () => {
    await resetAll();
  });

  it("never awards the same XP event twice", async () => {
    const evt = { id: "meal:breakfast:2026-11-03", date: "2026-11-03", type: "meal_breakfast", amount: 10, label: "Logged breakfast" };
    expect(await awardXp(evt)).toBe(true);
    expect(await awardXp(evt)).toBe(false);
    expect(await getDB().xp.count()).toBe(1);
  });

  it("onboarding seeds profile, targets, templates, foods and the starting weigh-in", async () => {
    await completeOnboarding({ profile: { startWeightLb: 205 }, targets: { calories: 1800 }, startDate: "2026-11-03" });
    const db = getDB();
    expect((await db.profile.get("me"))?.onboarded).toBe(true);
    expect(await db.targets.count()).toBe(1);
    expect(await db.templates.count()).toBe(4);
    expect(await db.foods.count()).toBeGreaterThan(20);
    expect((await db.weights.get("2026-11-03"))?.weightLb).toBe(205);
  });

  it("versions targets by date instead of overwriting history", async () => {
    await completeOnboarding({ profile: {}, targets: { calories: 1800 }, startDate: "2026-11-01" });
    await saveTargets({ calories: 1700 }, "2026-11-20");
    await saveTargets({ calories: 1750 }, "2026-11-20");
    const rows = (await getDB().targets.orderBy("effectiveFrom").toArray()).map((t) => [t.effectiveFrom, t.calories]);
    expect(rows).toEqual([
      ["2026-11-01", 1800],
      ["2026-11-20", 1750],
    ]);
  });

  it("logs and deletes food entries", async () => {
    await logFoodItems("2026-11-03", "lunch", [{ name: "Rice", servingSize: "1 cup", servings: 1, calories: 205, protein: 4, carbs: 45, fat: 0 }]);
    const [entry] = await getDB().foodEntries.toArray();
    expect(entry).toMatchObject({ meal: "lunch", calories: 205 });
    await deleteFoodEntry(entry.id);
    expect(await getDB().foodEntries.count()).toBe(0);
  });

  it("imports health steps without clobbering larger manual entries", async () => {
    await setSteps("2026-11-01", 9000);
    await setSteps("2026-11-02", 3000);
    const n = await importHealthSteps(
      [
        { date: "2026-11-01", steps: 8000 },
        { date: "2026-11-02", steps: 7000 },
        { date: "2026-11-03", steps: 5000 },
      ],
      "apple_health"
    );
    const db = getDB();
    expect(n).toBe(2);
    expect(await db.steps.get("2026-11-01")).toMatchObject({ steps: 9000, source: "manual" });
    expect(await db.steps.get("2026-11-02")).toMatchObject({ steps: 7000, source: "apple_health" });
    expect(await db.steps.get("2026-11-03")).toMatchObject({ steps: 5000, source: "apple_health" });
  });
});
