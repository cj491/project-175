/**
 * Core domain types for PROJECT 175.
 *
 * Every persisted record has a stable string id plus createdAt/updatedAt
 * timestamps so a cloud sync layer (e.g. Supabase) can be added later
 * without changing the shape of local data.
 */

export type ISODate = string; // "YYYY-MM-DD" (local calendar day)
export type ISODateTime = string; // full ISO timestamp

export interface BaseRecord {
  id: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/* ───────────────────────── Profile & targets ───────────────────────── */

export type Sex = "male" | "female";
export type DayType = "strength" | "walk" | "optional" | "rest";

export interface ScheduleDay {
  type: DayType;
  templateId?: string; // for strength days
  label: string;
}

/** Index 0 = Monday … 6 = Sunday */
export type WeeklySchedule = ScheduleDay[];

export interface Reminder {
  id: string;
  label: string;
  time: string; // "HH:MM"
  enabled: boolean;
  kind: "workout" | "protein" | "water" | "checkin" | "steps" | "custom";
}

export interface Profile extends BaseRecord {
  name: string;
  age: number;
  sex: Sex;
  heightIn: number;
  startWeightLb: number;
  goalWeightLb: number;
  targetBodyFatPct: number;
  startDate: ISODate;
  timelineDays: number;
  lifestyle: string;
  equipment: string;
  schedule: WeeklySchedule;
  reminders: Reminder[];
  walkPaceMph: number; // used for *estimated* distance
  notificationsEnabled: boolean;
  onboarded: boolean;
  /** Highest level the user has already seen the level-up celebration for. */
  lastLevelSeen?: number;
}

/**
 * Targets are versioned: changing a goal creates a new row effective from a
 * date, so history is always evaluated against the target that applied then.
 */
export interface Targets extends BaseRecord {
  effectiveFrom: ISODate;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  waterMl: number;
  steps: number;
  walkMinutes: number;
  strengthPerWeek: number;
}

/* ───────────────────────────── Nutrition ───────────────────────────── */

export type MealCategory = "breakfast" | "lunch" | "dinner" | "snacks";

export interface Macros {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export type FoodSource = "custom" | "reference" | "external";

export interface Food extends BaseRecord, Macros {
  name: string;
  brand?: string;
  servingSize: string; // human-readable, e.g. "1 cup (240 ml)"
  source: FoodSource;
  externalId?: string; // reserved for a future food database / barcode API
  isFavorite: boolean;
  useCount: number;
  lastUsedAt?: ISODateTime;
}

export interface MealItem extends Macros {
  foodId?: string;
  name: string;
  servingSize: string;
  servings: number;
}

export interface SavedMeal extends BaseRecord {
  name: string;
  items: MealItem[];
  isFavorite: boolean;
  useCount: number;
}

export interface FoodEntry extends BaseRecord, Macros {
  date: ISODate;
  loggedAt: ISODateTime;
  meal: MealCategory;
  name: string;
  servingSize: string;
  servings: number;
  foodId?: string;
  savedMealId?: string;
}

export interface WaterEntry extends BaseRecord {
  date: ISODate;
  ml: number;
  loggedAt: ISODateTime;
}

/* ───────────────────────────── Training ───────────────────────────── */

export type ExerciseUnit = "reps" | "seconds";

export interface TemplateExercise {
  id: string;
  name: string;
  sets: number;
  repMin: number;
  repMax: number;
  unit: ExerciseUnit;
  perSide?: boolean;
  restSec: number;
  notes?: string;
}

export interface WorkoutTemplate extends BaseRecord {
  name: string;
  shortName: string; // "A", "B", "C", "+"
  description: string;
  isBonus: boolean;
  order: number;
  exercises: TemplateExercise[];
}

export interface SetLog {
  id: string;
  weight: number | null; // lb; 0 = bodyweight
  reps: number | null; // reps, or seconds for timed exercises
  done: boolean;
  completedAt?: ISODateTime;
}

export interface SessionExercise {
  id: string;
  exerciseKey: string; // normalised name used to link history
  name: string;
  unit: ExerciseUnit;
  targetSets: number;
  repMin: number;
  repMax: number;
  perSide?: boolean;
  restSec: number;
  notes?: string;
  skipped: boolean;
  replacedFrom?: string;
  sets: SetLog[];
}

export type SessionStatus = "active" | "completed" | "discarded";

export interface WorkoutSession extends BaseRecord {
  date: ISODate;
  templateId?: string;
  name: string;
  isBonus: boolean;
  status: SessionStatus;
  startedAt: ISODateTime;
  endedAt?: ISODateTime;
  currentIndex: number;
  restEndsAt?: ISODateTime | null;
  exercises: SessionExercise[];
  notes?: string;
}

/* ───────────────────────────── Activity ───────────────────────────── */

export type ActivitySource = "manual" | "apple_health" | "health_connect";

export interface StepDay {
  date: ISODate; // primary key
  steps: number;
  source: ActivitySource;
  updatedAt: ISODateTime;
}

export interface WalkSession extends BaseRecord {
  date: ISODate;
  minutes: number;
  estDistanceMi: number; // ESTIMATE from pace setting
  loggedAt: ISODateTime;
  source: ActivitySource;
  note?: string;
}

/* ───────────────────────────── Body / progress ───────────────────────────── */

export interface WeightEntry {
  date: ISODate; // primary key — one weigh-in per day
  weightLb: number;
  loggedAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Measurement extends BaseRecord {
  date: ISODate;
  waistIn?: number;
  chestIn?: number;
  hipsIn?: number;
  armIn?: number;
  thighIn?: number;
  bodyFatPctEstimate?: number; // manual estimate only — never inferred
  notes?: string;
}

export type PhotoPose = "front" | "side" | "back";

export interface ProgressPhoto extends BaseRecord {
  date: ISODate;
  pose: PhotoPose;
  blob: Blob;
  width: number;
  height: number;
  notes?: string;
}

export interface DailyCheckin {
  date: ISODate; // primary key
  energy: number; // 1–5 self-reported
  sleepHours?: number;
  mood: number; // 1–5 self-reported
  notes?: string;
  updatedAt: ISODateTime;
}

/* ───────────────────────────── Gamification ───────────────────────────── */

/**
 * XP events use a deterministic primary key (e.g. "meal:breakfast:2026-11-03").
 * IndexedDB rejects duplicate keys, so the same reward can never be claimed twice.
 */
export interface XpEvent {
  id: string;
  date: ISODate;
  type: string;
  amount: number;
  label: string;
  createdAt: ISODateTime;
}

export interface UnlockedAchievement {
  id: string;
  unlockedAt: ISODateTime;
  seen: boolean;
}
