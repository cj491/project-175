import type { AppData } from "../app-data";
import type { ISODate } from "../types";
import { addDays, dateRange, daysBetween, formatDate, lastNDays, weekdayIndex } from "../dates";
import { dayTotals, mealsLogged, targetsFor, waterOn, MAIN_MEALS } from "./nutrition";
import { stepsOn, walkMinutesOn } from "./activity";
import { completedSessions } from "./workout";
import { buildDailyMissions } from "../gamification/missions";
import { avg, fmt, round, sum } from "../utils";

/* ───────────────────────────── Weight ───────────────────────────── */

export function sortedWeights(data: AppData) {
  return [...data.weights].sort((a, b) => a.date.localeCompare(b.date));
}

export function currentWeight(data: AppData): number {
  const w = sortedWeights(data);
  return w.length ? w[w.length - 1].weightLb : data.profile?.startWeightLb ?? 0;
}

/** Average of weigh-ins in the 7 days ending on `date` (null if none). */
export function rollingAvgWeight(data: AppData, date: ISODate, days = 7) {
  const from = addDays(date, -(days - 1));
  return avg(data.weights.filter((w) => w.date >= from && w.date <= date).map((w) => w.weightLb));
}

export function weightSeries(data: AppData) {
  const sorted = sortedWeights(data);
  return sorted.map((w) => ({
    date: w.date,
    label: formatDate(w.date),
    weight: w.weightLb,
    avg: round(rollingAvgWeight(data, w.date) ?? w.weightLb, 1),
  }));
}

export function transformation(data: AppData, today: ISODate) {
  const p = data.profile;
  if (!p) return null;
  const cur = currentWeight(data);
  const lost = round(p.startWeightLb - cur, 1);
  const total = p.startWeightLb - p.goalWeightLb;
  const remaining = round(Math.max(0, cur - p.goalWeightLb), 1);
  const day = Math.max(1, daysBetween(p.startDate, today) + 1);
  const timePct = Math.min(1, day / p.timelineDays);
  return {
    current: cur,
    start: p.startWeightLb,
    goal: p.goalWeightLb,
    lost,
    remaining,
    progress: total > 0 ? Math.max(0, Math.min(1, lost / total)) : 0,
    day: Math.min(day, p.timelineDays),
    totalDays: p.timelineDays,
    timePct,
    started: daysBetween(p.startDate, today) >= 0,
  };
}

/* ───────────────────────────── Daily series ───────────────────────────── */

export function dailySeries(data: AppData, end: ISODate, n: number) {
  return lastNDays(end, n).map((date) => {
    const t = targetsFor(data.targets, date);
    const tot = dayTotals(data.foodEntries, date);
    return {
      date,
      label: formatDate(date, { month: "short", day: "numeric" }),
      short: formatDate(date, { weekday: "narrow" }),
      calories: tot.calories,
      protein: tot.protein,
      carbs: tot.carbs,
      fat: tot.fat,
      calorieTarget: t?.calories ?? 0,
      proteinTarget: t?.protein ?? 0,
      steps: stepsOn(data.steps, date),
      stepTarget: t?.steps ?? 0,
      walkMin: walkMinutesOn(data.walks, date),
      water: waterOn(data.water, date),
      logged: tot.calories > 0,
    };
  });
}

/* ───────────────────────────── Weekly check-in ───────────────────────────── */

export interface WeekSummary {
  week: number;
  from: ISODate;
  to: ISODate;
  complete: boolean;
  avgWeight: number | null;
  weightChange: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  daysLogged: number;
  daysElapsed: number;
  workouts: number;
  avgSteps: number | null;
  walkMinutes: number;
  missionsCompleted: number;
  xpEarned: number;
  observations: string[];
}

export function weeklySummaries(data: AppData, today: ISODate): WeekSummary[] {
  const p = data.profile;
  if (!p) return [];
  const out: WeekSummary[] = [];
  const totalWeeks = Math.max(1, Math.floor(daysBetween(p.startDate, today) / 7) + 1);
  const sessions = completedSessions(data.sessions);
  for (let i = 0; i < totalWeeks; i++) {
    const from = addDays(p.startDate, i * 7);
    const to = addDays(from, 6);
    const days = dateRange(from, to < today ? to : today);
    const weights = data.weights.filter((w) => w.date >= from && w.date <= to).map((w) => w.weightLb);
    const loggedDays = days.filter((d) => dayTotals(data.foodEntries, d).calories > 0);
    const cals = loggedDays.map((d) => dayTotals(data.foodEntries, d).calories);
    const prot = loggedDays.map((d) => dayTotals(data.foodEntries, d).protein);
    const stepDays = days.map((d) => stepsOn(data.steps, d)).filter((s) => s > 0);
    const missions = days.reduce((a, d) => a + buildDailyMissions(data, d).filter((m) => m.complete).length, 0);
    const avgW = avg(weights);
    const prev = out[out.length - 1];
    const s: WeekSummary = {
      week: i + 1,
      from,
      to,
      complete: to < today,
      avgWeight: avgW === null ? null : round(avgW, 1),
      weightChange: avgW !== null && prev?.avgWeight != null ? round(avgW - prev.avgWeight, 1) : null,
      avgCalories: cals.length ? Math.round(avg(cals)!) : null,
      avgProtein: prot.length ? Math.round(avg(prot)!) : null,
      daysLogged: loggedDays.length,
      daysElapsed: days.length,
      workouts: sessions.filter((x) => x.date >= from && x.date <= to).length,
      avgSteps: stepDays.length ? Math.round(avg(stepDays)!) : null,
      walkMinutes: sum(days, (d) => walkMinutesOn(data.walks, d)),
      missionsCompleted: missions,
      xpEarned: sum(data.xp.filter((x) => x.date >= from && x.date <= to), (x) => x.amount),
      observations: [],
    };
    s.observations = weekObservations(s, data, out);
    out.push(s);
  }
  return out.reverse();
}

function weekObservations(s: WeekSummary, data: AppData, previous: WeekSummary[]): string[] {
  const obs: string[] = [];
  const t = targetsFor(data.targets, s.to);
  if (!t) return obs;
  const elapsed = s.daysElapsed;

  if (s.weightChange !== null) {
    const ch = s.weightChange;
    if (ch <= -1.6) obs.push(`Weekly average dropped ${fmt(-ch, 1)} lb — faster than ~1.5 lb/week. If you feel unusually tired or hungry, consider eating a little more.`);
    else if (ch < -0.2) obs.push(`Weekly average down ${fmt(-ch, 1)} lb. That's right in the 0.5–1.5 lb/week sweet spot.`);
    else if (ch <= 0.4) {
      const flatWeeks = [...previous].slice(-2).filter((w) => w.weightChange !== null && w.weightChange > -0.2).length;
      obs.push(
        flatWeeks >= 2
          ? "Weight has been flat for about 3 weeks. Check portion accuracy and activity first; if that's solid, a small 100–150 kcal adjustment is reasonable."
          : "Weight held steady this week. Single weeks fluctuate — the 2–3 week trend matters more."
      );
    } else obs.push(`Weekly average up ${fmt(ch, 1)} lb. Water, sodium and training can cause this — keep logging and watch the trend.`);
  } else if (s.avgWeight === null) {
    obs.push("No weigh-ins this week. A few morning weigh-ins give you a reliable weekly average.");
  }

  if (s.avgProtein !== null) {
    const ratio = s.avgProtein / t.protein;
    if (ratio >= 0.95) obs.push(`Protein averaged ${s.avgProtein} g — on target. That protects muscle while you lose fat.`);
    else if (ratio >= 0.8) obs.push(`Protein averaged ${s.avgProtein} g, close to your ${t.protein} g goal. One extra high-protein snack closes the gap.`);
    else obs.push(`Protein averaged ${s.avgProtein} g. Building meals around a protein source first is the quickest win.`);
  }

  if (s.daysLogged > 0 && s.daysLogged < Math.min(5, elapsed)) {
    obs.push(`Food logged on ${s.daysLogged} of ${elapsed} days. More complete logs make your averages more trustworthy.`);
  }

  if (s.workouts >= t.strengthPerWeek) obs.push(`${s.workouts} strength sessions — you hit your weekly training target.`);
  else if (s.complete) obs.push(`${s.workouts} of ${t.strengthPerWeek} strength sessions. Even a short session keeps the habit alive.`);

  if (s.avgSteps !== null) {
    obs.push(
      s.avgSteps >= t.steps
        ? `Averaged ${fmt(s.avgSteps)} steps a day — above your ${fmt(t.steps)} goal.`
        : `Averaged ${fmt(s.avgSteps)} steps a day. A 10-minute walk after meals adds roughly 1,000 steps.`
    );
  }
  return obs;
}

/* ───────────────────────────── Coach messages ───────────────────────────── */

export function coachMessages(data: AppData, today: ISODate): string[] {
  const msgs: string[] = [];
  const t = targetsFor(data.targets, today);
  const p = data.profile;
  if (!t || !p) return msgs;
  const tot = dayTotals(data.foodEntries, today);
  const logged = mealsLogged(data.foodEntries, today);
  const hour = new Date().getHours();
  const weekStart = addDays(today, -weekdayIndex(today));
  const weekWorkouts = completedSessions(data.sessions).filter((s) => s.date >= weekStart && s.date <= today).length;
  const day = p.schedule[weekdayIndex(today)];
  const workedOutToday = completedSessions(data.sessions).some((s) => s.date === today);
  const proteinLeft = Math.round(t.protein - tot.protein);

  if (weekWorkouts >= 3) msgs.push(`${weekWorkouts === 3 ? "Three" : weekWorkouts} workouts completed this week. That's discipline.`);
  if (proteinLeft > 0 && proteinLeft <= 40 && tot.protein > 0) msgs.push(`You're ${proteinLeft} g away from your protein goal — one high-protein snack does it.`);
  else if (proteinLeft <= 0) msgs.push("Protein target hit. Your muscles thank you.");
  if (day.type === "strength" && !workedOutToday) msgs.push(hour < 17 ? `${day.label} is on the plan today. Your workout is waiting.` : `Still time for ${day.label} — even 30 focused minutes counts.`);
  if (workedOutToday) msgs.push("Workout done. Recovery starts now — hit your protein and get good sleep.");
  if (day.type === "rest") msgs.push("Recovery day. Easy movement and good food are part of the plan.");
  if (logged.size === 0 && hour >= 10) msgs.push("Log your first meal and the day starts counting.");
  if (MAIN_MEALS.every((m) => logged.has(m))) msgs.push("All main meals logged. That kind of awareness is what changes results.");

  const yesterday = addDays(today, -1);
  if (data.foodEntries.some((e) => e.date === yesterday) && logged.size === 0) msgs.push("You logged yesterday — keep the chain going today.");
  if (!msgs.length) msgs.push("You're building momentum. Keep going.");
  return msgs;
}

/** Contextual nudges used by the reminder system. */
export function reminderMessage(kind: string, data: AppData, today: ISODate): string | null {
  const t = targetsFor(data.targets, today);
  if (!t || !data.profile) return null;
  const tot = dayTotals(data.foodEntries, today);
  switch (kind) {
    case "workout": {
      const day = data.profile.schedule[weekdayIndex(today)];
      if (day.type !== "strength" || completedSessions(data.sessions).some((s) => s.date === today)) return null;
      return `${day.label}: your workout is waiting.`;
    }
    case "protein": {
      const left = Math.round(t.protein - tot.protein);
      return left > 0 ? `You're ${left} g away from your protein goal.` : null;
    }
    case "water": {
      const left = t.waterMl - waterOn(data.water, today);
      return left > 0 ? `${fmt(left / 1000, 1)} L of water to go today.` : null;
    }
    case "steps": {
      const left = t.steps - stepsOn(data.steps, today);
      return left > 0 ? `${fmt(left)} steps to your goal — a short walk gets you closer.` : null;
    }
    case "checkin":
      return data.checkins.some((c) => c.date === today) ? null : "Time for your evening check-in.";
    default:
      return null;
  }
}
