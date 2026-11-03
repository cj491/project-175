import { describe, expect, it } from "vitest";
import { dayStreak, weeklyWorkoutStreak, workoutConsistencyStreak } from "./streaks";
import { levelFor, LEVELS } from "./levels";
import { adaptiveStepTarget, buildDailyMissions, eligibleRewards, XP } from "./missions";
import { ACHIEVEMENTS, isEarned } from "./achievements";
import { addDays } from "../dates";
import { exercise, food, makeData, session } from "../test-utils";

const days = (start: string, offsets: number[]) => new Set(offsets.map((o) => addDays(start, o)));

describe("dayStreak", () => {
  const start = "2026-10-01";
  it("counts consecutive days", () => {
    const r = dayStreak(days(start, [0, 1, 2, 3]), addDays(start, 3), start);
    expect(r.current).toBe(4);
    expect(r.activeToday).toBe(true);
  });

  it("does not break before today is logged", () => {
    const r = dayStreak(days(start, [0, 1, 2]), addDays(start, 3), start);
    expect(r.current).toBe(3);
    expect(r.atRisk).toBe(true);
  });

  it("resets on a missed day with no shields", () => {
    const r = dayStreak(days(start, [0, 1, 3]), addDays(start, 3), start);
    expect(r.current).toBe(1);
    expect(r.best).toBe(2);
  });

  it("earns a shield after 7 days and spends it on a single miss", () => {
    const active = days(start, [0, 1, 2, 3, 4, 5, 6, 8]);
    const r = dayStreak(active, addDays(start, 8), start);
    expect(r.current).toBe(8);
    expect(r.shieldsUsed).toBe(1);
    expect(r.shields).toBe(0);
  });

  it("caps shields at 2", () => {
    const active = days(start, Array.from({ length: 28 }, (_, i) => i));
    expect(dayStreak(active, addDays(start, 27), start).shields).toBe(2);
  });
});

describe("levels", () => {
  it("maps XP to levels and progress", () => {
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(199).level).toBe(1);
    expect(levelFor(200).level).toBe(2);
    expect(levelFor(350).progress).toBeCloseTo(0.5);
    const top = LEVELS[LEVELS.length - 1];
    expect(levelFor(top.minXp + 5000)).toMatchObject({ level: top.level, next: null, progress: 1 });
  });
});

describe("missions", () => {
  it("assigns a workout mission on strength days and a walk mission on walk days", () => {
    const data = makeData("2026-11-02");
    const monday = buildDailyMissions(data, "2026-11-02").map((m) => m.type);
    const tuesday = buildDailyMissions(data, "2026-11-03").map((m) => m.type);
    expect(monday).toContain("workout");
    expect(monday).not.toContain("walk");
    expect(tuesday).toContain("walk");
    expect(tuesday).not.toContain("workout");
  });

  it("only completes the calorie mission once all main meals are logged and under target", () => {
    const d = "2026-11-03";
    const partial = makeData(d, { foodEntries: [food(d, "breakfast", 400, 40), food(d, "lunch", 500, 50)] });
    expect(buildDailyMissions(partial, d).find((m) => m.type === "calories")!.complete).toBe(false);
    const full = makeData(d, { foodEntries: [...partial.foodEntries, food(d, "dinner", 600, 60)] });
    expect(buildDailyMissions(full, d).find((m) => m.type === "calories")!.complete).toBe(true);
    const over = makeData(d, { foodEntries: [...full.foodEntries, food(d, "dinner", 900, 10)] });
    expect(buildDailyMissions(over, d).find((m) => m.type === "calories")!.complete).toBe(false);
  });

  it("gives deterministic, date-scoped reward ids", () => {
    const d = "2026-11-03";
    const data = makeData(d, { foodEntries: [food(d, "breakfast", 300, 30)] });
    const ids = eligibleRewards(data, d).map((r) => r.id);
    expect(ids).toEqual(["meal:breakfast:2026-11-03"]);
  });

  it("awards a workout as an extra on a non-strength day, once", () => {
    const d = "2026-11-03";
    const sets: Array<[number, number]> = [[40, 10], [40, 10], [40, 10]];
    const data = makeData(d, { sessions: [session(d, [exercise("Goblet squat", sets)]), session(d, [exercise("Goblet squat", sets)])] });
    const workout = eligibleRewards(data, d).filter((r) => r.type === "workout");
    expect(workout).toHaveLength(1);
    expect(workout[0]).toMatchObject({ id: `workout:${d}`, amount: XP.workout });
  });

  it("adapts the step target when the recent average is well below the goal", () => {
    const d = "2026-11-10";
    const steps = [1, 2, 3, 4].map((i) => ({ date: addDays(d, -i), steps: 4000, source: "manual" as const, updatedAt: "" }));
    expect(adaptiveStepTarget(makeData("2026-11-01", { steps }), d, 8000)).toEqual({ target: 5500, adaptive: true });
    expect(adaptiveStepTarget(makeData("2026-11-01"), d, 8000)).toEqual({ target: 8000, adaptive: false });
  });
});

describe("streaks over workouts", () => {
  it("counts weekly target streaks and scheduled-day consistency", () => {
    const start = "2026-10-19"; // Monday
    const sets: Array<[number, number]> = [[40, 10]];
    const weekDays = ["2026-10-19", "2026-10-21", "2026-10-23", "2026-10-26", "2026-10-28", "2026-10-30"];
    const data = makeData(start, { sessions: weekDays.map((d) => session(d, [exercise("Squat", sets)])) });
    expect(weeklyWorkoutStreak(data, "2026-11-01", 3)).toEqual({ streak: 2, thisWeek: 3 });
    expect(workoutConsistencyStreak(data, "2026-11-01")).toBe(6);
  });
});

describe("achievements", () => {
  it("unlocks weight milestones from weigh-ins", () => {
    const data = makeData("2026-11-01");
    const def = ACHIEVEMENTS.find((a) => a.id === "lost-5")!;
    expect(isEarned(def, data, { today: "2026-11-03", totalXp: 0, currentWeight: 201 })).toBe(false);
    expect(isEarned(def, data, { today: "2026-11-03", totalXp: 0, currentWeight: 200 })).toBe(true);
  });
});
