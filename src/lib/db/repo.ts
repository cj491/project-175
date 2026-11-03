import Dexie from "dexie";
import { getDB, ALL_TABLES } from "./db";
import { buildProfile, buildTargets, defaultTemplates, referenceFoods } from "./defaults";
import type {
  DailyCheckin,
  Food,
  FoodEntry,
  MealCategory,
  MealItem,
  Measurement,
  PhotoPose,
  Profile,
  SavedMeal,
  SessionExercise,
  Targets,
  WorkoutSession,
  WorkoutTemplate,
  XpEvent,
} from "../types";
import { normaliseKey, round, uid } from "../utils";
import { nowISO, todayISO } from "../dates";
import { estimateDistanceMi } from "../domain/activity";

/* ───────────────────────────── Setup ───────────────────────────── */

export interface OnboardingInput {
  profile: Partial<Profile>;
  targets: Partial<Targets>;
  startDate: string;
}

/** Creates the initial profile, versioned targets, templates and food library. */
export async function completeOnboarding(input: OnboardingInput) {
  const db = getDB();
  const now = nowISO();
  await db.transaction("rw", [db.profile, db.targets, db.templates, db.foods, db.weights], async () => {
    const existing = await db.profile.get("me");
    const profile = buildProfile(now, input.startDate, {
      ...(existing ?? {}),
      ...input.profile,
      startDate: input.startDate,
      onboarded: true,
      updatedAt: now,
    });
    await db.profile.put(profile);

    if ((await db.targets.count()) === 0) {
      await db.targets.add(buildTargets(now, input.startDate, input.targets));
    } else {
      await saveTargetsInTx(input.targets, input.startDate);
    }
    if ((await db.templates.count()) === 0) await db.templates.bulkAdd(defaultTemplates(now));
    if ((await db.foods.count()) === 0) await db.foods.bulkAdd(referenceFoods(now));

    // The starting weight is real user-supplied data: record it as the first weigh-in.
    const startW = profile.startWeightLb;
    if (!(await db.weights.get(input.startDate))) {
      await db.weights.put({ date: input.startDate, weightLb: startW, loggedAt: now, updatedAt: now });
    }
  });
}

export async function updateProfile(patch: Partial<Profile>) {
  const db = getDB();
  await db.profile.update("me", { ...patch, updatedAt: nowISO() });
}

/* ───────────────────────────── Targets (versioned) ───────────────────────────── */

async function saveTargetsInTx(patch: Partial<Targets>, effectiveFrom: string) {
  const db = getDB();
  const now = nowISO();
  const all = await db.targets.orderBy("effectiveFrom").toArray();
  const current = [...all].reverse().find((t) => t.effectiveFrom <= effectiveFrom) ?? all[all.length - 1];
  const sameDay = all.find((t) => t.effectiveFrom === effectiveFrom);
  const values = { ...(current ?? buildTargets(now, effectiveFrom)), ...patch };
  if (sameDay) {
    await db.targets.put({ ...values, id: sameDay.id, effectiveFrom, createdAt: sameDay.createdAt, updatedAt: now });
  } else {
    await db.targets.add({ ...values, id: uid(), effectiveFrom, createdAt: now, updatedAt: now });
  }
}

/** Changing a target creates a new version effective today; past days keep their old targets. */
export async function saveTargets(patch: Partial<Targets>, effectiveFrom = todayISO()) {
  const db = getDB();
  await db.transaction("rw", db.targets, () => saveTargetsInTx(patch, effectiveFrom));
}

/* ───────────────────────────── Nutrition ───────────────────────────── */

export async function logFoodItems(date: string, meal: MealCategory, items: MealItem[], savedMealId?: string) {
  const db = getDB();
  const now = nowISO();
  await db.transaction("rw", [db.foodEntries, db.foods, db.savedMeals], async () => {
    for (const it of items) {
      const entry: FoodEntry = {
        id: uid(),
        createdAt: now,
        updatedAt: now,
        date,
        loggedAt: now,
        meal,
        name: it.name,
        servingSize: it.servingSize,
        servings: it.servings,
        calories: round(it.calories),
        protein: round(it.protein, 1),
        carbs: round(it.carbs, 1),
        fat: round(it.fat, 1),
        foodId: it.foodId,
        savedMealId,
      };
      await db.foodEntries.add(entry);
      if (it.foodId) {
        const f = await db.foods.get(it.foodId);
        if (f) await db.foods.update(f.id, { useCount: f.useCount + 1, lastUsedAt: now });
      }
    }
    if (savedMealId) {
      const m = await db.savedMeals.get(savedMealId);
      if (m) await db.savedMeals.update(m.id, { useCount: m.useCount + 1, updatedAt: now });
    }
  });
}

export async function updateFoodEntry(id: string, patch: Partial<FoodEntry>) {
  await getDB().foodEntries.update(id, { ...patch, updatedAt: nowISO() });
}

export async function deleteFoodEntry(id: string) {
  await getDB().foodEntries.delete(id);
}

/** Copy every entry from one day's meal into another day's meal. */
export async function duplicateMeal(fromDate: string, fromMeal: MealCategory, toDate: string, toMeal: MealCategory) {
  const db = getDB();
  const src = await db.foodEntries.where("[date+meal]").equals([fromDate, fromMeal]).toArray();
  if (!src.length) return 0;
  const now = nowISO();
  await db.foodEntries.bulkAdd(
    src.map((e) => ({ ...e, id: uid(), date: toDate, meal: toMeal, loggedAt: now, createdAt: now, updatedAt: now }))
  );
  return src.length;
}

export async function saveFood(food: Omit<Food, "id" | "createdAt" | "updatedAt" | "useCount" | "isFavorite"> & Partial<Food>) {
  const db = getDB();
  const now = nowISO();
  if (food.id) {
    await db.foods.update(food.id, { ...food, updatedAt: now });
    return food.id;
  }
  const id = uid();
  await db.foods.add({ useCount: 0, isFavorite: false, ...food, id, createdAt: now, updatedAt: now } as Food);
  return id;
}

/** Saves an online search result into the local library (deduped by externalId) and returns its id. */
export async function saveExternalFood(r: { externalId?: string; name: string; brand?: string; servingSize: string; calories: number; protein: number; carbs: number; fat: number }) {
  const db = getDB();
  if (r.externalId) {
    const existing = (await db.foods.toArray()).find((f) => f.externalId === r.externalId);
    if (existing) return existing.id;
  }
  return saveFood({ name: r.name, brand: r.brand, servingSize: r.servingSize, calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat, source: "external", externalId: r.externalId });
}

export async function deleteFood(id: string) {
  await getDB().foods.delete(id);
}

export async function toggleFoodFavorite(id: string) {
  const db = getDB();
  const f = await db.foods.get(id);
  if (f) await db.foods.update(id, { isFavorite: !f.isFavorite, updatedAt: nowISO() });
}

export async function saveMeal(name: string, items: MealItem[], id?: string) {
  const db = getDB();
  const now = nowISO();
  if (id) {
    await db.savedMeals.update(id, { name, items, updatedAt: now });
    return id;
  }
  const meal: SavedMeal = { id: uid(), name, items, isFavorite: true, useCount: 0, createdAt: now, updatedAt: now };
  await db.savedMeals.add(meal);
  return meal.id;
}

export async function deleteSavedMeal(id: string) {
  await getDB().savedMeals.delete(id);
}

export async function addWater(date: string, ml: number) {
  const now = nowISO();
  await getDB().water.add({ id: uid(), date, ml, loggedAt: now, createdAt: now, updatedAt: now });
}

export async function undoLastWater(date: string) {
  const db = getDB();
  const rows = await db.water.where("date").equals(date).sortBy("loggedAt");
  const last = rows[rows.length - 1];
  if (last) await db.water.delete(last.id);
}

/* ───────────────────────────── Activity ───────────────────────────── */

export async function setSteps(date: string, steps: number) {
  await getDB().steps.put({ date, steps: Math.max(0, Math.round(steps)), source: "manual", updatedAt: nowISO() });
}

export async function addSteps(date: string, delta: number) {
  const db = getDB();
  await db.transaction("rw", db.steps, async () => {
    const cur = await db.steps.get(date);
    await setSteps(date, (cur?.steps ?? 0) + delta);
  });
}

/**
 * Imports daily step totals from Apple Health / Health Connect. A day you
 * entered manually is only replaced if the device reports more steps.
 */
export async function importHealthSteps(days: { date: string; steps: number }[], source: "apple_health" | "health_connect") {
  const db = getDB();
  let changed = 0;
  await db.transaction("rw", db.steps, async () => {
    for (const d of days) {
      const cur = await db.steps.get(d.date);
      if (cur && cur.source === "manual" && cur.steps >= d.steps) continue;
      if (cur && cur.steps === d.steps && cur.source === source) continue;
      await db.steps.put({ date: d.date, steps: Math.max(0, Math.round(d.steps)), source, updatedAt: nowISO() });
      changed++;
    }
  });
  return changed;
}

export async function addWalk(date: string, minutes: number, paceMph: number, note?: string) {
  const now = nowISO();
  await getDB().walks.add({
    id: uid(),
    date,
    minutes,
    estDistanceMi: estimateDistanceMi(minutes, paceMph),
    loggedAt: now,
    source: "manual",
    note,
    createdAt: now,
    updatedAt: now,
  });
}

export async function deleteWalk(id: string) {
  await getDB().walks.delete(id);
}

/* ───────────────────────────── Body ───────────────────────────── */

export async function setWeight(date: string, weightLb: number) {
  const now = nowISO();
  await getDB().weights.put({ date, weightLb: round(weightLb, 1), loggedAt: now, updatedAt: now });
}

export async function deleteWeight(date: string) {
  await getDB().weights.delete(date);
}

export async function saveMeasurement(m: Omit<Measurement, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const db = getDB();
  const now = nowISO();
  if (m.id) {
    await db.measurements.update(m.id, { ...m, updatedAt: now });
  } else {
    await db.measurements.add({ ...m, id: uid(), createdAt: now, updatedAt: now });
  }
}

export async function deleteMeasurement(id: string) {
  await getDB().measurements.delete(id);
}

export async function addPhoto(date: string, pose: PhotoPose, blob: Blob, width: number, height: number, notes?: string) {
  const now = nowISO();
  await getDB().photos.add({ id: uid(), date, pose, blob, width, height, notes, createdAt: now, updatedAt: now });
}

export async function deletePhoto(id: string) {
  await getDB().photos.delete(id);
}

export async function saveCheckin(c: Omit<DailyCheckin, "updatedAt">) {
  await getDB().checkins.put({ ...c, updatedAt: nowISO() });
}

/* ───────────────────────────── Training ───────────────────────────── */

export async function saveTemplate(t: WorkoutTemplate) {
  await getDB().templates.put({ ...t, updatedAt: nowISO() });
}

export async function createTemplate(name: string) {
  const db = getDB();
  const now = nowISO();
  const count = await db.templates.count();
  const t: WorkoutTemplate = {
    id: uid(),
    name,
    shortName: name.slice(0, 1).toUpperCase(),
    description: "Custom workout",
    isBonus: false,
    order: count,
    exercises: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.templates.add(t);
  return t.id;
}

export async function deleteTemplate(id: string) {
  await getDB().templates.delete(id);
}

export function templateToSessionExercises(t: WorkoutTemplate | undefined): SessionExercise[] {
  if (!t) return [];
  return t.exercises.map((e) => ({
    id: uid(),
    exerciseKey: normaliseKey(e.name),
    name: e.name,
    unit: e.unit,
    targetSets: e.sets,
    repMin: e.repMin,
    repMax: e.repMax,
    perSide: e.perSide,
    restSec: e.restSec,
    notes: e.notes,
    skipped: false,
    sets: Array.from({ length: e.sets }, () => ({ id: uid(), weight: null, reps: null, done: false })),
  }));
}

/** Starts a workout. Only one session can be active at a time. */
export async function startSession(template: WorkoutTemplate | undefined, date: string, prefill?: (ex: SessionExercise) => SessionExercise) {
  const db = getDB();
  const active = await db.sessions.where("status").equals("active").first();
  if (active) return active.id;
  const now = nowISO();
  const exercises = templateToSessionExercises(template).map((e) => (prefill ? prefill(e) : e));
  const s: WorkoutSession = {
    id: uid(),
    date,
    templateId: template?.id,
    name: template?.name ?? "Quick workout",
    isBonus: template?.isBonus ?? false,
    status: "active",
    startedAt: now,
    currentIndex: 0,
    restEndsAt: null,
    exercises,
    createdAt: now,
    updatedAt: now,
  };
  await db.sessions.add(s);
  return s.id;
}

export async function updateSession(id: string, patch: Partial<WorkoutSession>) {
  await getDB().sessions.update(id, { ...patch, updatedAt: nowISO() });
}

export async function finishSession(id: string) {
  const now = nowISO();
  await getDB().sessions.update(id, { status: "completed", endedAt: now, restEndsAt: null, updatedAt: now });
}

export async function discardSession(id: string) {
  await getDB().sessions.delete(id);
}

export async function deleteSession(id: string) {
  await getDB().sessions.delete(id);
}

/* ───────────────────────────── Gamification ───────────────────────────── */

/**
 * Awards XP exactly once per event id. The id is the table's primary key, so
 * IndexedDB itself enforces uniqueness — a duplicate insert throws
 * ConstraintError and we report "not awarded".
 */
export async function awardXp(evt: Omit<XpEvent, "createdAt">): Promise<boolean> {
  try {
    await getDB().xp.add({ ...evt, createdAt: nowISO() });
    return true;
  } catch (err) {
    if (err instanceof Dexie.ConstraintError || (err as { name?: string })?.name === "ConstraintError") return false;
    throw err;
  }
}

export async function unlockAchievement(id: string): Promise<boolean> {
  try {
    await getDB().achievements.add({ id, unlockedAt: nowISO(), seen: false });
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === "ConstraintError") return false;
    throw err;
  }
}

export async function markAchievementSeen(id: string) {
  await getDB().achievements.update(id, { seen: true });
}

/* ───────────────────────────── Data management ───────────────────────────── */

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function exportAll(includePhotos: boolean) {
  const db = getDB();
  const out: Record<string, unknown[]> = {};
  for (const name of ALL_TABLES) {
    if (name === "photos") {
      if (!includePhotos) continue;
      const photos = await db.photos.toArray();
      out.photos = await Promise.all(photos.map(async (p) => ({ ...p, blob: await blobToDataUrl(p.blob) })));
      continue;
    }
    out[name] = await db.table(name).toArray();
  }
  return { app: "project-175", version: 1, exportedAt: nowISO(), data: out };
}

export async function importAll(payload: { data: Record<string, unknown[]> }) {
  const db = getDB();
  // Decode photos before opening the transaction: awaiting non-IndexedDB work
  // inside a Dexie transaction would commit it early.
  const data: Record<string, unknown[]> = { ...payload.data };
  if (Array.isArray(data.photos)) {
    data.photos = await Promise.all(
      (data.photos as Array<Record<string, unknown>>).map(async (p) => ({
        ...p,
        blob: await (await fetch(p.blob as string)).blob(),
      }))
    );
  }
  await db.transaction("rw", ALL_TABLES.map((n) => db.table(n)), async () => {
    for (const name of ALL_TABLES) {
      const rows = data[name];
      if (!Array.isArray(rows)) continue;
      await db.table(name).clear();
      await db.table(name).bulkAdd(rows);
    }
  });
}

export async function resetAll() {
  const db = getDB();
  await db.transaction("rw", ALL_TABLES.map((n) => db.table(n)), async () => {
    for (const name of ALL_TABLES) await db.table(name).clear();
  });
}
