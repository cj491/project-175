import Dexie, { type Table } from "dexie";
import type {
  DailyCheckin,
  Food,
  FoodEntry,
  Measurement,
  Profile,
  ProgressPhoto,
  SavedMeal,
  StepDay,
  Targets,
  UnlockedAchievement,
  WalkSession,
  WaterEntry,
  WeightEntry,
  WorkoutSession,
  WorkoutTemplate,
  XpEvent,
} from "../types";
import { isRemoteTx, markDirty } from "../sync/dirty";

/**
 * Local-first persistence (IndexedDB via Dexie).
 *
 * This is the only module that talks to storage directly. Feature code goes
 * through the repositories in ./repo.ts, so swapping in (or syncing with) a
 * remote database later doesn't require touching UI code.
 */
export class Project175DB extends Dexie {
  profile!: Table<Profile, string>;
  targets!: Table<Targets, string>;
  foods!: Table<Food, string>;
  savedMeals!: Table<SavedMeal, string>;
  foodEntries!: Table<FoodEntry, string>;
  water!: Table<WaterEntry, string>;
  templates!: Table<WorkoutTemplate, string>;
  sessions!: Table<WorkoutSession, string>;
  steps!: Table<StepDay, string>;
  walks!: Table<WalkSession, string>;
  weights!: Table<WeightEntry, string>;
  measurements!: Table<Measurement, string>;
  photos!: Table<ProgressPhoto, string>;
  checkins!: Table<DailyCheckin, string>;
  xp!: Table<XpEvent, string>;
  achievements!: Table<UnlockedAchievement, string>;

  constructor() {
    super("project175");
    this.version(1).stores({
      profile: "id",
      targets: "id, effectiveFrom",
      foods: "id, name, useCount, lastUsedAt",
      savedMeals: "id, name, useCount",
      foodEntries: "id, date, meal, [date+meal], loggedAt",
      water: "id, date",
      templates: "id, order",
      sessions: "id, date, status, templateId, startedAt",
      steps: "date",
      walks: "id, date",
      weights: "date",
      measurements: "id, date",
      photos: "id, date, pose",
      checkins: "date",
      xp: "id, date, type",
      achievements: "id",
    });
    this.trackChanges();
  }

  /** Records every local change so cloud sync knows what to push. Photos never sync. */
  private trackChanges() {
    for (const name of SYNCED_TABLES) {
      const table = this.table(name);
      const pk = table.schema.primKey.keyPath as string;
      table.hook("creating", (primKey, obj, tx) => {
        if (!isRemoteTx(tx)) markDirty(name, String(primKey ?? (obj as Record<string, unknown>)[pk]));
      });
      table.hook("updating", (_mods, primKey, _obj, tx) => {
        if (!isRemoteTx(tx)) markDirty(name, String(primKey));
      });
      table.hook("deleting", (primKey, _obj, tx) => {
        if (!isRemoteTx(tx)) markDirty(name, String(primKey));
      });
    }
  }
}

let _db: Project175DB | null = null;

/** Lazily constructed so nothing touches IndexedDB during server rendering. */
export function getDB(): Project175DB {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB is only available in the browser");
  }
  if (!_db) _db = new Project175DB();
  return _db;
}

export const ALL_TABLES = [
  "profile",
  "targets",
  "foods",
  "savedMeals",
  "foodEntries",
  "water",
  "templates",
  "sessions",
  "steps",
  "walks",
  "weights",
  "measurements",
  "photos",
  "checkins",
  "xp",
  "achievements",
] as const;
export type TableName = (typeof ALL_TABLES)[number];

/** Everything except photos, which stay on this device. */
export const SYNCED_TABLES = ALL_TABLES.filter((t) => t !== "photos");
