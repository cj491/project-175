import type { AppData } from "./app-data";
import { buildProfile, buildTargets, defaultTemplates } from "./db/defaults";
import type { FoodEntry, SessionExercise, WorkoutSession } from "./types";
import { normaliseKey } from "./utils";

const NOW = "2026-11-03T12:00:00.000Z";

/** An empty, onboarded data snapshot for tests. */
export function makeData(startDate = "2026-11-02", patch: Partial<AppData> = {}): AppData {
  return {
    profile: buildProfile(NOW, startDate, { onboarded: true }),
    targets: [buildTargets(NOW, startDate)],
    foods: [],
    savedMeals: [],
    foodEntries: [],
    water: [],
    templates: defaultTemplates(NOW),
    sessions: [],
    steps: [],
    walks: [],
    weights: [],
    measurements: [],
    checkins: [],
    xp: [],
    achievements: [],
    photoCount: 0,
    ...patch,
  };
}

let n = 0;
export function food(date: string, meal: FoodEntry["meal"], calories: number, protein: number): FoodEntry {
  n++;
  return { id: `f${n}`, createdAt: NOW, updatedAt: NOW, date, loggedAt: NOW, meal, name: "Food", servingSize: "1", servings: 1, calories, protein, carbs: 0, fat: 0 };
}

export function exercise(name: string, sets: Array<[number | null, number | null]>, opts: Partial<SessionExercise> = {}): SessionExercise {
  return {
    id: `${name}-${n++}`,
    exerciseKey: normaliseKey(name),
    name,
    unit: "reps",
    targetSets: sets.length,
    repMin: 8,
    repMax: 12,
    restSec: 90,
    skipped: false,
    sets: sets.map(([weight, reps], i) => ({ id: `s${i}`, weight, reps, done: true })),
    ...opts,
  };
}

export function session(date: string, exercises: SessionExercise[], startedAt = `${date}T10:00:00.000Z`): WorkoutSession {
  return {
    id: `sess-${date}-${n++}`,
    createdAt: NOW,
    updatedAt: NOW,
    date,
    name: "Strength A",
    isBonus: false,
    status: "completed",
    startedAt,
    endedAt: startedAt,
    currentIndex: 0,
    exercises,
  };
}
