import type { AppData } from "../app-data";
import type { ISODate } from "../types";
import { completedSessions, countPRs, exerciseHistory } from "../domain/workout";
import { activeDaySet, dayStreak } from "./streaks";
import { targetsFor } from "../domain/nutrition";
import { sum } from "../utils";

export type AchievementIcon =
  | "dumbbell"
  | "flame"
  | "calendar"
  | "zap"
  | "trophy"
  | "footprints"
  | "scale"
  | "target"
  | "crown"
  | "utensils"
  | "camera"
  | "droplet"
  | "beef"
  | "medal";

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  icon: AchievementIcon;
  tier: "bronze" | "silver" | "gold";
  progress: (data: AppData, ctx: AchievementCtx) => { value: number; target: number };
}

export interface AchievementCtx {
  today: ISODate;
  totalXp: number;
  currentWeight: number;
}

const lost = (d: AppData, c: AchievementCtx) => Math.max(0, (d.profile?.startWeightLb ?? 0) - c.currentWeight);

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: "first-meal", title: "First Bite", description: "Log your first meal", icon: "utensils", tier: "bronze", progress: (d) => ({ value: Math.min(1, d.foodEntries.length), target: 1 }) },
  { id: "first-workout", title: "First Workout", description: "Complete your first strength session", icon: "dumbbell", tier: "bronze", progress: (d) => ({ value: Math.min(1, completedSessions(d.sessions).length), target: 1 }) },
  { id: "five-workouts", title: "First 5 Workouts", description: "Complete five strength sessions", icon: "dumbbell", tier: "silver", progress: (d) => ({ value: Math.min(5, completedSessions(d.sessions).length), target: 5 }) },
  { id: "twenty-five-workouts", title: "Quarter Century", description: "Complete 25 strength sessions", icon: "medal", tier: "gold", progress: (d) => ({ value: Math.min(25, completedSessions(d.sessions).length), target: 25 }) },
  {
    id: "streak-7",
    title: "7-Day Streak",
    description: "Show up seven days in a row",
    icon: "flame",
    tier: "silver",
    progress: (d, c) => ({ value: Math.min(7, dayStreak(activeDaySet(d), c.today, d.profile?.startDate ?? c.today).best), target: 7 }),
  },
  {
    id: "consistency-30",
    title: "30-Day Consistency",
    description: "Log activity on 30 different days",
    icon: "calendar",
    tier: "gold",
    progress: (d) => ({ value: Math.min(30, activeDaySet(d).size), target: 30 }),
  },
  { id: "xp-1000", title: "First 1,000 XP", description: "Earn 1,000 total XP", icon: "zap", tier: "silver", progress: (_d, c) => ({ value: Math.min(1000, c.totalXp), target: 1000 }) },
  {
    id: "first-pr",
    title: "First Personal Record",
    description: "Beat a previous best on any lift",
    icon: "trophy",
    tier: "silver",
    progress: (d) => ({ value: Math.min(1, countPRs(exerciseHistory(d.sessions))), target: 1 }),
  },
  {
    id: "steps-10k",
    title: "10,000 Steps",
    description: "Hit 10,000 steps in a single day",
    icon: "footprints",
    tier: "silver",
    progress: (d) => ({ value: Math.min(10000, Math.max(0, ...d.steps.map((s) => s.steps))), target: 10000 }),
  },
  {
    id: "protein-week",
    title: "Protein Week",
    description: "Hit your protein target on 7 days",
    icon: "beef",
    tier: "silver",
    progress: (d) => {
      const byDay = new Map<string, number>();
      d.foodEntries.forEach((e) => byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.protein));
      let hits = 0;
      for (const [date, p] of byDay) {
        const t = targetsFor(d.targets, date);
        if (t && p >= t.protein) hits++;
      }
      return { value: Math.min(7, hits), target: 7 };
    },
  },
  {
    id: "hydrated",
    title: "Hydration Habit",
    description: "Reach your water goal on 5 days",
    icon: "droplet",
    tier: "bronze",
    progress: (d) => {
      const byDay = new Map<string, number>();
      d.water.forEach((w) => byDay.set(w.date, (byDay.get(w.date) ?? 0) + w.ml));
      let hits = 0;
      for (const [date, ml] of byDay) {
        const t = targetsFor(d.targets, date);
        if (t && ml >= t.waterMl) hits++;
      }
      return { value: Math.min(5, hits), target: 5 };
    },
  },
  { id: "first-photo", title: "Day One Snapshot", description: "Add your first progress photo", icon: "camera", tier: "bronze", progress: (d) => ({ value: Math.min(1, d.photoCount), target: 1 }) },
  { id: "walk-10h", title: "Ten-Hour Walker", description: "Log 600 minutes of walking", icon: "footprints", tier: "gold", progress: (d) => ({ value: Math.min(600, sum(d.walks, (w) => w.minutes)), target: 600 }) },
  { id: "lost-5", title: "First 5 Pounds Lost", description: "Down 5 lb from your starting weight", icon: "scale", tier: "silver", progress: (d, c) => ({ value: Math.min(5, lost(d, c)), target: 5 }) },
  {
    id: "halfway",
    title: "Halfway to 175",
    description: "Lose half the weight to your goal",
    icon: "target",
    tier: "gold",
    progress: (d, c) => {
      const total = Math.max(1, (d.profile?.startWeightLb ?? 0) - (d.profile?.goalWeightLb ?? 0));
      return { value: Math.min(total / 2, lost(d, c)), target: total / 2 };
    },
  },
  {
    id: "club-175",
    title: "175 Club",
    description: "Reach your goal weight",
    icon: "crown",
    tier: "gold",
    progress: (d, c) => {
      const total = Math.max(1, (d.profile?.startWeightLb ?? 0) - (d.profile?.goalWeightLb ?? 0));
      return { value: Math.min(total, lost(d, c)), target: total };
    },
  },
];

export function isEarned(def: AchievementDef, data: AppData, ctx: AchievementCtx) {
  const p = def.progress(data, ctx);
  return p.target > 0 && p.value >= p.target;
}
