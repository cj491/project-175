import { describe, expect, it } from "vitest";
import { caloriesFromMacros, scaleMacros, targetsFor, totalMacros } from "./nutrition";
import { compareOverload, countPRs, exerciseHistory, nextTimeSuggestion, sessionCounts, summarizeExercise } from "./workout";
import { estimateDistanceMi } from "./activity";
import { buildTargets } from "../db/defaults";
import { exercise, session } from "../test-utils";

describe("nutrition maths", () => {
  it("scales and totals macros", () => {
    const yogurt = { calories: 130, protein: 23, carbs: 9, fat: 0 };
    expect(scaleMacros(yogurt, 1.5)).toEqual({ calories: 195, protein: 34.5, carbs: 13.5, fat: 0 });
    expect(totalMacros([scaleMacros(yogurt, 2), { calories: 120, protein: 24, carbs: 3, fat: 1 }])).toEqual({ calories: 380, protein: 70, carbs: 21, fat: 1 });
    expect(caloriesFromMacros({ protein: 30, carbs: 50, fat: 8 })).toBe(392);
  });

  it("uses the target version in effect on each date", () => {
    const history = [buildTargets("", "2026-11-01", { calories: 1800 }), buildTargets("", "2026-11-15", { calories: 1700 })];
    expect(targetsFor(history, "2026-11-10")!.calories).toBe(1800);
    expect(targetsFor(history, "2026-11-15")!.calories).toBe(1700);
    expect(targetsFor(history, "2026-12-01")!.calories).toBe(1700);
  });
});

describe("progressive overload", () => {
  const perf = (sets: Array<[number, number]>, date = "2026-11-03") => {
    const s = session(date, [exercise("Goblet squat", sets)]);
    return summarizeExercise(s, s.exercises[0])!;
  };

  it("detects weight increases, rep increases, maintenance and declines", () => {
    const base = perf([[40, 10], [40, 10], [40, 9]]);
    expect(compareOverload(perf([[45, 8], [45, 8], [45, 8]]), base)).toBe("weight_up");
    expect(compareOverload(perf([[40, 11], [40, 10], [40, 10]]), base)).toBe("reps_up");
    expect(compareOverload(perf([[40, 10], [40, 10], [40, 9]]), base)).toBe("maintained");
    expect(compareOverload(perf([[35, 8], [35, 8], [35, 8]]), base)).toBe("declined");
    expect(compareOverload(base)).toBe("first");
  });

  it("suggests adding weight once the top of the range is hit on every set", () => {
    expect(nextTimeSuggestion(perf([[40, 12], [40, 12], [40, 12]]))).toMatch(/more weight/);
    expect(nextTimeSuggestion(perf([[40, 12], [40, 11], [40, 10]]))).toMatch(/one more rep/);
  });

  it("counts PRs only when a later session beats every earlier one", () => {
    const sessions = [
      session("2026-11-01", [exercise("Goblet squat", [[40, 10]])]),
      session("2026-11-03", [exercise("Goblet squat", [[40, 10]])]),
      session("2026-11-05", [exercise("Goblet squat", [[45, 8]])]),
    ];
    expect(countPRs(exerciseHistory(sessions))).toBe(1);
  });

  it("only counts sessions with at least half the sets done", () => {
    const ex = exercise("Goblet squat", [[40, 10], [40, 10], [40, 10], [40, 10]]);
    ex.sets[0].done = false;
    ex.sets[1].done = false;
    ex.sets[2].done = false;
    expect(sessionCounts(session("2026-11-03", [ex]))).toBe(false);
    ex.sets[2].done = true;
    expect(sessionCounts(session("2026-11-03", [ex]))).toBe(true);
  });
});

describe("activity estimates", () => {
  it("estimates distance from pace", () => {
    expect(estimateDistanceMi(30, 3)).toBe(1.5);
  });
});
