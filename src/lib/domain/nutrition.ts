import type { FoodEntry, ISODate, Macros, MealCategory, MealItem, Targets, WaterEntry } from "../types";
import { round, sum } from "../utils";

export const MEALS: { key: MealCategory; label: string; xp: number }[] = [
  { key: "breakfast", label: "Breakfast", xp: 10 },
  { key: "lunch", label: "Lunch", xp: 10 },
  { key: "dinner", label: "Dinner", xp: 10 },
  { key: "snacks", label: "Snacks", xp: 0 },
];

export const MAIN_MEALS: MealCategory[] = ["breakfast", "lunch", "dinner"];

export function emptyMacros(): Macros {
  return { calories: 0, protein: 0, carbs: 0, fat: 0 };
}

export function totalMacros(items: Macros[]): Macros {
  return {
    calories: round(sum(items, (i) => i.calories)),
    protein: round(sum(items, (i) => i.protein), 1),
    carbs: round(sum(items, (i) => i.carbs), 1),
    fat: round(sum(items, (i) => i.fat), 1),
  };
}

/** Scales per-serving macros by a servings multiplier. */
export function scaleMacros(m: Macros, servings: number): Macros {
  return {
    calories: round(m.calories * servings),
    protein: round(m.protein * servings, 1),
    carbs: round(m.carbs * servings, 1),
    fat: round(m.fat * servings, 1),
  };
}

export function mealItemFromFood(
  food: { id?: string; name: string; servingSize: string } & Macros,
  servings: number
): MealItem {
  return { foodId: food.id, name: food.name, servingSize: food.servingSize, servings, ...scaleMacros(food, servings) };
}

/** Calories implied by macros (4/4/9). Used to sanity-check manual entries. */
export function caloriesFromMacros(m: Pick<Macros, "protein" | "carbs" | "fat">) {
  return Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
}

export function entriesOn(entries: FoodEntry[], date: ISODate) {
  return entries.filter((e) => e.date === date);
}

export function dayTotals(entries: FoodEntry[], date: ISODate) {
  return totalMacros(entriesOn(entries, date));
}

export function mealsLogged(entries: FoodEntry[], date: ISODate): Set<MealCategory> {
  return new Set(entriesOn(entries, date).map((e) => e.meal));
}

export function waterOn(water: WaterEntry[], date: ISODate) {
  return sum(water.filter((w) => w.date === date), (w) => w.ml);
}

/** The target version in effect on a given date. */
export function targetsFor(history: Targets[], date: ISODate): Targets | undefined {
  if (!history.length) return undefined;
  const sorted = [...history].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  let found = sorted[0];
  for (const t of sorted) if (t.effectiveFrom <= date) found = t;
  return found;
}

/** Calorie mission: all three main meals logged and total at or under target (+50 kcal grace). */
export function withinCalories(total: number, target: number) {
  return total > 0 && total <= target + 50;
}

export function macroCalorieSplit(m: Macros) {
  const p = m.protein * 4;
  const c = m.carbs * 4;
  const f = m.fat * 9;
  const t = p + c + f || 1;
  return { protein: p / t, carbs: c / t, fat: f / t };
}
