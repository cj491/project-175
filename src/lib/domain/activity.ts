import type { ISODate, StepDay, WalkSession } from "../types";
import { round, sum } from "../utils";

/** Distance is an ESTIMATE from minutes × the user's pace setting. */
export function estimateDistanceMi(minutes: number, paceMph: number) {
  return round((minutes / 60) * paceMph, 2);
}

/** Rough estimate: ~2,000 steps per mile for an average stride. Labeled as estimated in UI. */
export function estimateStepsFromWalk(minutes: number, paceMph: number) {
  return Math.round(estimateDistanceMi(minutes, paceMph) * 2000);
}

export function stepsOn(steps: StepDay[], date: ISODate) {
  return steps.find((s) => s.date === date)?.steps ?? 0;
}

export function walksOn(walks: WalkSession[], date: ISODate) {
  return walks.filter((w) => w.date === date);
}

export function walkMinutesOn(walks: WalkSession[], date: ISODate) {
  return sum(walksOn(walks, date), (w) => w.minutes);
}
