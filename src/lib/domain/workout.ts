import type { ISODate, SessionExercise, SetLog, WorkoutSession } from "../types";
import { round } from "../utils";

export type OverloadStatus = "weight_up" | "reps_up" | "maintained" | "declined" | "first";

export interface ExercisePerformance {
  sessionId: string;
  date: ISODate;
  exerciseKey: string;
  name: string;
  unit: SessionExercise["unit"];
  sets: SetLog[];
  topWeight: number;
  topReps: number; // reps at top weight
  totalReps: number;
  volume: number; // weight × reps
  est1RM: number; // Epley estimate (reps-based only)
  hitTopOfRange: boolean;
  repMax: number;
}

export function doneSets(ex: SessionExercise) {
  return ex.sets.filter((s) => s.done && (s.reps ?? 0) > 0);
}

export function epley(weight: number, reps: number) {
  if (!weight || !reps) return 0;
  return round(weight * (1 + reps / 30), 1);
}

export function summarizeExercise(session: WorkoutSession, ex: SessionExercise): ExercisePerformance | null {
  const sets = doneSets(ex);
  if (!sets.length || ex.skipped) return null;
  let topWeight = 0;
  let topReps = 0;
  for (const s of sets) {
    const w = s.weight ?? 0;
    const r = s.reps ?? 0;
    if (w > topWeight || (w === topWeight && r > topReps)) {
      topWeight = w;
      topReps = r;
    }
  }
  const totalReps = sets.reduce((a, s) => a + (s.reps ?? 0), 0);
  const volume = sets.reduce((a, s) => a + (s.weight ?? 0) * (s.reps ?? 0), 0);
  const est1RM = ex.unit === "reps" ? Math.max(...sets.map((s) => epley(s.weight ?? 0, s.reps ?? 0))) : 0;
  const hitTopOfRange = sets.length >= ex.targetSets && sets.every((s) => (s.reps ?? 0) >= ex.repMax);
  return {
    sessionId: session.id,
    date: session.date,
    exerciseKey: ex.exerciseKey,
    name: ex.name,
    unit: ex.unit,
    sets,
    topWeight,
    topReps,
    totalReps,
    volume,
    est1RM,
    hitTopOfRange,
    repMax: ex.repMax,
  };
}

/** All completed performances, oldest first, grouped by exercise key. */
export function exerciseHistory(sessions: WorkoutSession[]): Map<string, ExercisePerformance[]> {
  const map = new Map<string, ExercisePerformance[]>();
  const completed = sessions
    .filter((s) => s.status === "completed")
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
  for (const s of completed) {
    for (const ex of s.exercises) {
      const perf = summarizeExercise(s, ex);
      if (!perf) continue;
      const list = map.get(perf.exerciseKey) ?? [];
      list.push(perf);
      map.set(perf.exerciseKey, list);
    }
  }
  return map;
}

/** Compares a performance to the previous one for the same exercise. */
export function compareOverload(cur: ExercisePerformance, prev?: ExercisePerformance): OverloadStatus {
  if (!prev) return "first";
  if (cur.topWeight > prev.topWeight) return "weight_up";
  if (cur.topWeight < prev.topWeight) {
    // Lighter but meaningfully more total work still counts as progress in reps.
    return cur.volume > prev.volume * 1.05 ? "reps_up" : "declined";
  }
  if (cur.topReps > prev.topReps || cur.totalReps > prev.totalReps) return "reps_up";
  if (cur.topReps === prev.topReps && cur.totalReps === prev.totalReps) return "maintained";
  return cur.totalReps >= prev.totalReps * 0.9 ? "maintained" : "declined";
}

export const OVERLOAD_LABEL: Record<OverloadStatus, string> = {
  weight_up: "Weight increased",
  reps_up: "More reps",
  maintained: "Maintained",
  declined: "Below last time",
  first: "First log",
};

export interface PersonalRecord {
  exerciseKey: string;
  name: string;
  unit: SessionExercise["unit"];
  heaviest: { weight: number; reps: number; date: ISODate } | null;
  best1RM: { value: number; date: ISODate } | null;
  bestReps: { reps: number; weight: number; date: ISODate } | null;
}

export function personalRecords(history: Map<string, ExercisePerformance[]>): PersonalRecord[] {
  const out: PersonalRecord[] = [];
  for (const [key, perfs] of history) {
    const pr: PersonalRecord = { exerciseKey: key, name: perfs[perfs.length - 1].name, unit: perfs[0].unit, heaviest: null, best1RM: null, bestReps: null };
    for (const p of perfs) {
      if (!pr.heaviest || p.topWeight > pr.heaviest.weight) pr.heaviest = { weight: p.topWeight, reps: p.topReps, date: p.date };
      if (p.est1RM && (!pr.best1RM || p.est1RM > pr.best1RM.value)) pr.best1RM = { value: p.est1RM, date: p.date };
      for (const s of p.sets) {
        const r = s.reps ?? 0;
        if (!pr.bestReps || r > pr.bestReps.reps) pr.bestReps = { reps: r, weight: s.weight ?? 0, date: p.date };
      }
    }
    out.push(pr);
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Number of PR events: a performance that beat every earlier performance of
 * the same exercise on top weight (loaded lifts) or best reps/seconds.
 */
export function countPRs(history: Map<string, ExercisePerformance[]>) {
  let count = 0;
  for (const perfs of history.values()) {
    let bestW = -1;
    let bestR = -1;
    perfs.forEach((p, i) => {
      const maxReps = Math.max(...p.sets.map((s) => s.reps ?? 0));
      if (i > 0 && (p.topWeight > bestW && p.topWeight > 0 || (p.topWeight === 0 && maxReps > bestR))) count++;
      bestW = Math.max(bestW, p.topWeight);
      bestR = Math.max(bestR, maxReps);
    });
  }
  return count;
}

/** Progression rule from the plan: top of range on every set → add weight next time. */
export function nextTimeSuggestion(last?: ExercisePerformance): string | null {
  if (!last) return null;
  if (last.hitTopOfRange) {
    return last.unit === "seconds" ? "You maxed the time range — add load or time." : `You hit ${last.repMax} on every set — try a little more weight.`;
  }
  return last.unit === "seconds" ? "Match or beat your last time." : "Aim for one more rep on a set than last time.";
}

export function sessionProgress(s: WorkoutSession) {
  const active = s.exercises.filter((e) => !e.skipped);
  const total = active.reduce((a, e) => a + e.sets.length, 0);
  const done = active.reduce((a, e) => a + e.sets.filter((x) => x.done).length, 0);
  return { total, done, pct: total ? done / total : 0 };
}

export function sessionVolume(s: WorkoutSession) {
  return s.exercises.reduce(
    (a, e) => a + (e.skipped ? 0 : e.sets.filter((x) => x.done).reduce((b, x) => b + (x.weight ?? 0) * (x.reps ?? 0), 0)),
    0
  );
}

export function sessionDurationSec(s: WorkoutSession, now = Date.now()) {
  const end = s.endedAt ? new Date(s.endedAt).getTime() : now;
  return Math.max(0, (end - new Date(s.startedAt).getTime()) / 1000);
}

/** A session "counts" (for XP, streaks, achievements) when at least half its sets were completed. */
export function sessionCounts(s: WorkoutSession) {
  return s.status === "completed" && sessionProgress(s).pct >= 0.5;
}

export function completedSessions(sessions: WorkoutSession[]) {
  return sessions.filter(sessionCounts);
}

export function formatSet(unit: SessionExercise["unit"], weight: number | null, reps: number | null) {
  const w = weight ? `${weight} lb` : "BW";
  const r = unit === "seconds" ? `${reps ?? 0}s` : `${reps ?? 0}`;
  return `${w} × ${r}`;
}

export function formatPrescription(e: { sets: number; repMin: number; repMax: number; unit: SessionExercise["unit"]; perSide?: boolean }) {
  const range = e.repMin === e.repMax ? `${e.repMin}` : `${e.repMin}–${e.repMax}`;
  return `${e.sets} × ${range}${e.unit === "seconds" ? " sec" : ""}${e.perSide ? "/side" : ""}`;
}
