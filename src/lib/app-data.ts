import type {
  DailyCheckin,
  Food,
  FoodEntry,
  Measurement,
  Profile,
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
} from "./types";

/** A full in-memory snapshot of the user's data (photos excluded — they load lazily). */
export interface AppData {
  profile: Profile | undefined;
  targets: Targets[];
  foods: Food[];
  savedMeals: SavedMeal[];
  foodEntries: FoodEntry[];
  water: WaterEntry[];
  templates: WorkoutTemplate[];
  sessions: WorkoutSession[];
  steps: StepDay[];
  walks: WalkSession[];
  weights: WeightEntry[];
  measurements: Measurement[];
  checkins: DailyCheckin[];
  xp: XpEvent[];
  achievements: UnlockedAchievement[];
  photoCount: number;
}
