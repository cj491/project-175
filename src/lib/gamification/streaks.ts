import type { AppData } from "../app-data";
import type { ISODate } from "../types";
import { addDays, startOfWeek, weekdayIndex } from "../dates";
import { completedSessions } from "../domain/workout";

/**
 * Streak recovery: every 7 consecutive active days earns a "streak shield"
 * (max 2 banked). A missed day automatically spends a shield instead of
 * resetting the streak — so one off day never wipes out your progress.
 */
export interface StreakResult {
  current: number;
  best: number;
  shields: number;
  shieldsUsed: number;
  activeToday: boolean;
  /** true when today isn't done yet but yesterday kept the streak alive */
  atRisk: boolean;
}

export const MAX_SHIELDS = 2;
const SHIELD_EVERY = 7;

/** Generic day-based streak with recovery shields. */
export function dayStreak(activeDays: Set<ISODate>, today: ISODate, startDate: ISODate, useShields = true): StreakResult {
  // Walk forward from the start so shield accrual is deterministic.
  let current = 0;
  let best = 0;
  let shields = 0;
  let shieldsUsed = 0;
  let sinceShield = 0;

  const first = [...activeDays].filter((d) => d >= startDate).sort()[0];
  if (!first) return { current: 0, best: 0, shields: 0, shieldsUsed: 0, activeToday: false, atRisk: false };

  for (let d = first; d <= today; d = addDays(d, 1)) {
    if (activeDays.has(d)) {
      current++;
      sinceShield++;
      if (sinceShield >= SHIELD_EVERY) {
        shields = Math.min(MAX_SHIELDS, shields + 1);
        sinceShield = 0;
      }
      best = Math.max(best, current);
    } else if (d !== today) {
      // Missed day: spend a shield to protect the streak, otherwise reset.
      if (useShields && current > 0 && shields > 0) {
        shields--;
        shieldsUsed++;
      } else {
        current = 0;
        sinceShield = 0;
      }
    }
  }
  const activeToday = activeDays.has(today);
  return { current, best, shields, shieldsUsed, activeToday, atRisk: !activeToday && current > 0 };
}

export function activeDaySet(data: AppData): Set<ISODate> {
  const s = new Set<ISODate>();
  data.foodEntries.forEach((e) => s.add(e.date));
  data.walks.forEach((w) => s.add(w.date));
  data.steps.forEach((x) => x.steps > 0 && s.add(x.date));
  data.weights.forEach((w) => s.add(w.date));
  data.water.forEach((w) => s.add(w.date));
  data.checkins.forEach((c) => s.add(c.date));
  completedSessions(data.sessions).forEach((x) => s.add(x.date));
  return s;
}

export function nutritionDaySet(data: AppData): Set<ISODate> {
  return new Set(data.foodEntries.map((e) => e.date));
}

/**
 * Workout consistency: consecutive scheduled strength days that were hit.
 * A scheduled day counts if any qualifying workout was completed on it or
 * before the next scheduled strength day (so moving a session is fine).
 * Today doesn't break the streak if it isn't done yet.
 */
export function workoutConsistencyStreak(data: AppData, today: ISODate): number {
  const schedule = data.profile?.schedule;
  const start = data.profile?.startDate;
  if (!schedule || !start) return 0;
  const workoutDays = new Set(completedSessions(data.sessions).map((s) => s.date));
  const isStrength = (d: ISODate) => schedule[weekdayIndex(d)]?.type === "strength";

  const scheduled: ISODate[] = [];
  for (let d = start; d <= today; d = addDays(d, 1)) if (isStrength(d)) scheduled.push(d);

  let streak = 0;
  for (let i = scheduled.length - 1; i >= 0; i--) {
    const day = scheduled[i];
    const windowEnd = i + 1 < scheduled.length ? addDays(scheduled[i + 1], -1) : today;
    let hit = false;
    for (let d = day; d <= windowEnd; d = addDays(d, 1)) if (workoutDays.has(d)) hit = true;
    if (hit) streak++;
    else if (i === scheduled.length - 1) continue; // current window still open
    else break;
  }
  return streak;
}

/** Consecutive weeks (Mon–Sun) with ≥ target strength sessions. The current week only counts once it's met. */
export function weeklyWorkoutStreak(data: AppData, today: ISODate, target: number): { streak: number; thisWeek: number } {
  const counts = new Map<ISODate, number>();
  for (const s of completedSessions(data.sessions)) {
    const wk = startOfWeek(s.date);
    counts.set(wk, (counts.get(wk) ?? 0) + 1);
  }
  const thisWeekStart = startOfWeek(today);
  const thisWeek = counts.get(thisWeekStart) ?? 0;
  let streak = thisWeek >= target ? 1 : 0;
  let wk = addDays(thisWeekStart, -7);
  const start = data.profile?.startDate ?? today;
  while (wk >= startOfWeek(start)) {
    if ((counts.get(wk) ?? 0) >= target) streak++;
    else break;
    wk = addDays(wk, -7);
  }
  return { streak, thisWeek };
}

export function allStreaks(data: AppData, today: ISODate, strengthTarget: number) {
  const start = data.profile?.startDate ?? today;
  return {
    activity: dayStreak(activeDaySet(data), today, start),
    nutrition: dayStreak(nutritionDaySet(data), today, start),
    workout: workoutConsistencyStreak(data, today),
    weekly: weeklyWorkoutStreak(data, today, strengthTarget),
  };
}
