import type { AppData } from "../app-data";
import type { ISODate } from "../types";
import { addDays, weekdayIndex } from "../dates";
import { dayTotals, mealsLogged, targetsFor, waterOn, withinCalories, MAIN_MEALS } from "../domain/nutrition";
import { stepsOn, walkMinutesOn } from "../domain/activity";
import { completedSessions } from "../domain/workout";
import { avg, clamp, fmt } from "../utils";

export type MissionIcon = "breakfast" | "lunch" | "dinner" | "protein" | "calories" | "workout" | "walk" | "steps" | "water" | "checkin" | "weight";

export interface Mission {
  /** Also the XP event id — guarantees one reward per mission per day. */
  id: string;
  type: string;
  title: string;
  detail: string;
  xp: number;
  icon: MissionIcon;
  progress: number; // 0..1
  complete: boolean;
  claimed: boolean;
  href: string;
}

export const XP = {
  meal: 10,
  protein: 25,
  calories: 20,
  workout: 50,
  walk: 20,
  steps: 25,
  water: 15,
  checkin: 10,
  weighin: 5,
  allMissions: 50,
} as const;

/**
 * Adaptive step target: if the recent average is well below the goal, the
 * mission meets you partway (avg + 1,500, rounded to 500) so it stays achievable.
 */
export function adaptiveStepTarget(data: AppData, date: ISODate, goal: number) {
  const recent: number[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = addDays(date, -i);
    const s = data.steps.find((x) => x.date === d);
    if (s && s.steps > 0) recent.push(s.steps);
  }
  const a = avg(recent);
  if (a === null || recent.length < 3 || a >= goal * 0.8) return { target: goal, adaptive: false };
  const t = clamp(Math.round((a + 1500) / 500) * 500, 3000, goal);
  return { target: t, adaptive: t < goal };
}

export function buildDailyMissions(data: AppData, date: ISODate): Mission[] {
  const targets = targetsFor(data.targets, date);
  const profile = data.profile;
  if (!targets || !profile) return [];
  const claimedIds = new Set(data.xp.filter((x) => x.date === date).map((x) => x.id));
  const totals = dayTotals(data.foodEntries, date);
  const logged = mealsLogged(data.foodEntries, date);
  const day = profile.schedule[weekdayIndex(date)];
  const missions: Omit<Mission, "claimed">[] = [];

  for (const meal of MAIN_MEALS) {
    const label = meal[0].toUpperCase() + meal.slice(1);
    missions.push({
      id: `meal:${meal}:${date}`,
      type: `meal_${meal}`,
      title: `Log ${label.toLowerCase()}`,
      detail: logged.has(meal) ? "Logged" : "Tap to log",
      xp: XP.meal,
      icon: meal as MissionIcon,
      progress: logged.has(meal) ? 1 : 0,
      complete: logged.has(meal),
      href: `/nutrition?meal=${meal}`,
    });
  }

  const proteinLeft = Math.max(0, targets.protein - totals.protein);
  missions.push({
    id: `protein:${date}`,
    type: "protein",
    title: `Hit ${fmt(targets.protein)} g protein`,
    detail: proteinLeft > 0 ? `${fmt(proteinLeft)} g to go` : "Target reached",
    xp: XP.protein,
    icon: "protein",
    progress: clamp(totals.protein / targets.protein, 0, 1),
    complete: totals.protein >= targets.protein,
    href: "/nutrition",
  });

  const allMains = MAIN_MEALS.every((m) => logged.has(m));
  const calOk = allMains && withinCalories(totals.calories, targets.calories);
  missions.push({
    id: `calories:${date}`,
    type: "calories",
    title: "Stay within your calories",
    detail: allMains
      ? calOk
        ? `${fmt(totals.calories)} / ${fmt(targets.calories)} kcal`
        : `${fmt(totals.calories - targets.calories)} kcal over — tomorrow's a fresh start`
      : "Completes once breakfast, lunch & dinner are logged",
    xp: XP.calories,
    icon: "calories",
    progress: allMains ? (calOk ? 1 : 0) : logged.size / 3,
    complete: calOk,
    href: "/nutrition",
  });

  const workoutsToday = completedSessions(data.sessions).filter((s) => s.date === date);
  const walkMin = walkMinutesOn(data.walks, date);
  if (day.type === "strength") {
    const tpl = data.templates.find((t) => t.id === day.templateId);
    missions.push({
      id: `workout:${date}`,
      type: "workout",
      title: `Complete ${tpl?.name ?? day.label}`,
      detail: workoutsToday.length ? "Done — great work" : tpl ? `${tpl.exercises.length} exercises` : "Any strength session counts",
      xp: XP.workout,
      icon: "workout",
      progress: workoutsToday.length ? 1 : 0,
      complete: workoutsToday.length > 0,
      href: "/training",
    });
  } else if (day.type === "walk" || day.type === "optional") {
    missions.push({
      id: `walk:${date}`,
      type: "walk",
      title: `Walk ${targets.walkMinutes} minutes`,
      detail: walkMin >= targets.walkMinutes ? `${walkMin} min logged` : `${walkMin} / ${targets.walkMinutes} min`,
      xp: XP.walk,
      icon: "walk",
      progress: clamp(walkMin / targets.walkMinutes, 0, 1),
      complete: walkMin >= targets.walkMinutes,
      href: "/activity",
    });
  }

  const { target: stepTarget, adaptive } = adaptiveStepTarget(data, date, targets.steps);
  const steps = stepsOn(data.steps, date);
  missions.push({
    id: `steps:${date}`,
    type: "steps",
    title: `Reach ${fmt(stepTarget)} steps`,
    detail: adaptive ? `Adaptive target · ${fmt(steps)} so far` : `${fmt(steps)} / ${fmt(stepTarget)}`,
    xp: XP.steps,
    icon: "steps",
    progress: clamp(steps / stepTarget, 0, 1),
    complete: steps >= stepTarget,
    href: "/activity",
  });

  const water = waterOn(data.water, date);
  missions.push({
    id: `water:${date}`,
    type: "water",
    title: `Drink ${fmt(targets.waterMl / 1000, 1)} L of water`,
    detail: `${fmt(water / 1000, 2)} / ${fmt(targets.waterMl / 1000, 1)} L`,
    xp: XP.water,
    icon: "water",
    progress: clamp(water / targets.waterMl, 0, 1),
    complete: water >= targets.waterMl,
    href: "/nutrition#water",
  });

  const checkedIn = data.checkins.some((c) => c.date === date);
  missions.push({
    id: `checkin:${date}`,
    type: "checkin",
    title: "Daily check-in",
    detail: checkedIn ? "Checked in" : "Energy, sleep & mood — 15 seconds",
    xp: XP.checkin,
    icon: "checkin",
    progress: checkedIn ? 1 : 0,
    complete: checkedIn,
    href: "/?checkin=1",
  });

  return missions.map((m) => ({ ...m, claimed: claimedIds.has(m.id) }));
}

export interface RewardCandidate {
  id: string;
  type: string;
  amount: number;
  label: string;
  date: ISODate;
}

/** Everything the user has earned today (missions + bonus actions). */
export function eligibleRewards(data: AppData, date: ISODate): RewardCandidate[] {
  const missions = buildDailyMissions(data, date);
  const out: RewardCandidate[] = missions
    .filter((m) => m.complete)
    .map((m) => ({ id: m.id, type: m.type, amount: m.xp, label: m.title.replace(/^Log /, "Logged "), date }));

  // Extras that aren't the day's mission but still deserve credit.
  const targets = targetsFor(data.targets, date);
  const hasWorkoutMission = missions.some((m) => m.type === "workout");
  const workoutsToday = completedSessions(data.sessions).filter((s) => s.date === date);
  if (!hasWorkoutMission && workoutsToday.length) {
    out.push({ id: `workout:${date}`, type: "workout", amount: XP.workout, label: workoutsToday[0].isBonus ? "Bonus workout complete" : "Workout complete", date });
  }
  const hasWalkMission = missions.some((m) => m.type === "walk");
  if (!hasWalkMission && targets && walkMinutesOn(data.walks, date) >= 30) {
    out.push({ id: `walk:${date}`, type: "walk", amount: XP.walk, label: "30-minute walk", date });
  }
  if (data.weights.some((w) => w.date === date)) {
    out.push({ id: `weighin:${date}`, type: "weighin", amount: XP.weighin, label: "Weigh-in logged", date });
  }
  if (missions.length && missions.every((m) => m.complete)) {
    out.push({ id: `allmissions:${date}`, type: "allmissions", amount: XP.allMissions, label: "All daily missions complete!", date });
  }
  return out;
}
