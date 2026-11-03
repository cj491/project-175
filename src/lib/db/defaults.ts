import type { Food, Profile, Reminder, Targets, WeeklySchedule, WorkoutTemplate, TemplateExercise } from "../types";
import { uid } from "../utils";

/** Starting profile supplied by the user. Every value is editable in Profile. */
export const STARTING_PROFILE = {
  name: "",
  age: 27,
  sex: "male" as const,
  heightIn: 70,
  startWeightLb: 205,
  goalWeightLb: 175,
  targetBodyFatPct: 15,
  timelineDays: 182,
  lifestyle: "Sedentary outside of exercise",
  equipment: "Adjustable dumbbells up to 50 lb per hand, gym access, walking pad (planned)",
  walkPaceMph: 3.0,
};

export const STARTING_TARGETS = {
  calories: 1800,
  protein: 175,
  carbs: 140,
  fat: 60,
  waterMl: 3000,
  steps: 8000,
  walkMinutes: 30,
  strengthPerWeek: 3,
};

export const TEMPLATE_IDS = { A: "tpl-strength-a", B: "tpl-strength-b", C: "tpl-strength-c", BONUS: "tpl-bonus" };

export function defaultSchedule(): WeeklySchedule {
  return [
    { type: "strength", templateId: TEMPLATE_IDS.A, label: "Strength A" },
    { type: "walk", label: "Walk — 30 min" },
    { type: "strength", templateId: TEMPLATE_IDS.B, label: "Strength B" },
    { type: "walk", label: "Walk + mobility" },
    { type: "strength", templateId: TEMPLATE_IDS.C, label: "Strength C" },
    { type: "optional", templateId: TEMPLATE_IDS.BONUS, label: "Optional walk or bonus" },
    { type: "rest", label: "Recovery" },
  ];
}

export function defaultReminders(): Reminder[] {
  return [
    { id: uid(), label: "Your workout is waiting", time: "17:30", enabled: true, kind: "workout" },
    { id: uid(), label: "Protein check-in", time: "15:00", enabled: true, kind: "protein" },
    { id: uid(), label: "Hydration break", time: "11:00", enabled: false, kind: "water" },
    { id: uid(), label: "Time for your evening check-in", time: "20:30", enabled: true, kind: "checkin" },
  ];
}

const ex = (
  name: string,
  repMin: number,
  repMax: number,
  opts: Partial<TemplateExercise> = {}
): TemplateExercise => ({
  id: uid(),
  name,
  sets: 3,
  repMin,
  repMax,
  unit: "reps",
  restSec: 90,
  ...opts,
});

export function defaultTemplates(now: string): WorkoutTemplate[] {
  const base = { createdAt: now, updatedAt: now };
  return [
    {
      ...base,
      id: TEMPLATE_IDS.A,
      name: "Strength A",
      shortName: "A",
      description: "Full body · 40–60 min",
      isBonus: false,
      order: 0,
      exercises: [
        ex("Goblet squat", 8, 12, { restSec: 120, notes: "Dumbbell at chest; controlled depth." }),
        ex("Dumbbell floor press", 8, 12, { restSec: 120, notes: "Floor press at home; bench press at gym." }),
        ex("One-arm dumbbell row", 10, 12, { perSide: true, notes: "Brace your torso; pull elbow towards hip." }),
        ex("Dumbbell Romanian deadlift", 8, 12, { restSec: 120, notes: "Hinge at hips; keep back neutral." }),
        ex("Plank", 20, 45, { unit: "seconds", restSec: 60, notes: "Stop before your lower back sags." }),
      ],
    },
    {
      ...base,
      id: TEMPLATE_IDS.B,
      name: "Strength B",
      shortName: "B",
      description: "Full body · 40–60 min",
      isBonus: false,
      order: 1,
      exercises: [
        ex("Reverse lunge", 8, 10, { perSide: true, notes: "Or split squat. Comfortable range; hold support if needed." }),
        ex("Dumbbell overhead press", 8, 12, { notes: "Only if comfortable; otherwise incline/chest press." }),
        ex("Lat pulldown", 8, 12, { notes: "At home, use a secure band setup." }),
        ex("Glute bridge", 10, 15, { notes: "Pause briefly at the top." }),
        ex("Dead bug", 8, 10, { perSide: true, restSec: 60, notes: "Move slowly; keep lower back controlled." }),
      ],
    },
    {
      ...base,
      id: TEMPLATE_IDS.C,
      name: "Strength C",
      shortName: "C",
      description: "Full body · 40–60 min",
      isBonus: false,
      order: 2,
      exercises: [
        ex("Dumbbell squat", 8, 12, { restSec: 120, notes: "Goblet squat or sit-to-stand variation." }),
        ex("Push-up", 8, 12, { notes: "Or dumbbell press. Elevate hands to scale." }),
        ex("Dumbbell row", 10, 12, { notes: "Chest-supported or one-arm. Avoid momentum." }),
        ex("Dumbbell Romanian deadlift", 8, 12, { restSec: 120, notes: "Or hamstring curl — the variation you can control." }),
        ex("Farmer carry", 30, 45, { unit: "seconds", restSec: 75, notes: "Walk tall with weights at your sides." }),
      ],
    },
    {
      ...base,
      id: TEMPLATE_IDS.BONUS,
      name: "Bonus Session",
      shortName: "+",
      description: "Optional 4th session · 30–40 min",
      isBonus: true,
      order: 3,
      exercises: [
        ex("Dumbbell incline press", 8, 12),
        ex("Dumbbell walking lunge", 8, 12, { perSide: true }),
        ex("Chest-supported row", 10, 12),
        ex("Dumbbell curl", 10, 15, { restSec: 60 }),
        ex("Overhead triceps extension", 10, 15, { restSec: 60 }),
        ex("Lateral raise", 12, 15, { restSec: 60 }),
      ],
    },
  ];
}

/**
 * Reference foods with typical label values. These are approximations so the
 * library isn't empty on day one — they are clearly marked "reference" in the
 * UI and every value is editable. This is NOT a live food database.
 */
const REF_FOODS: Array<[string, string, number, number, number, number]> = [
  // name, serving, kcal, protein, carbs, fat
  ["Chicken breast, cooked", "4 oz (113 g)", 187, 35, 0, 4],
  ["Ground turkey 93% lean, cooked", "4 oz (113 g)", 213, 27, 0, 12],
  ["Lean ground beef 90%, cooked", "4 oz (113 g)", 245, 28, 0, 14],
  ["Salmon, cooked", "4 oz (113 g)", 233, 25, 0, 14],
  ["Tuna, canned in water", "1 can (142 g)", 150, 33, 0, 1],
  ["Shrimp, cooked", "4 oz (113 g)", 112, 24, 0, 1],
  ["Large egg", "1 egg (50 g)", 72, 6, 0, 5],
  ["Egg whites", "1 cup (243 g)", 126, 26, 2, 0],
  ["Greek yogurt, nonfat plain", "1 cup (227 g)", 130, 23, 9, 0],
  ["Cottage cheese, low-fat", "1 cup (226 g)", 183, 28, 10, 2],
  ["Whey protein", "1 scoop (30 g)", 120, 24, 3, 1],
  ["Skim milk", "1 cup (240 ml)", 83, 8, 12, 0],
  ["Rolled oats, dry", "1/2 cup (40 g)", 150, 5, 27, 3],
  ["White rice, cooked", "1 cup (158 g)", 205, 4, 45, 0],
  ["Brown rice, cooked", "1 cup (195 g)", 218, 5, 46, 2],
  ["Potato, baked", "1 medium (173 g)", 161, 4, 37, 0],
  ["Sweet potato, baked", "1 medium (114 g)", 103, 2, 24, 0],
  ["Whole wheat bread", "1 slice (32 g)", 80, 4, 14, 1],
  ["Whole wheat tortilla", "1 tortilla (45 g)", 130, 4, 22, 3],
  ["Pasta, cooked", "1 cup (140 g)", 221, 8, 43, 1],
  ["Banana", "1 medium (118 g)", 105, 1, 27, 0],
  ["Apple", "1 medium (182 g)", 95, 0, 25, 0],
  ["Blueberries", "1 cup (148 g)", 84, 1, 21, 0],
  ["Broccoli", "1 cup (91 g)", 31, 3, 6, 0],
  ["Mixed salad greens", "2 cups (85 g)", 15, 1, 3, 0],
  ["Avocado", "1/2 fruit (68 g)", 114, 1, 6, 10],
  ["Olive oil", "1 tbsp (14 g)", 119, 0, 0, 14],
  ["Peanut butter", "2 tbsp (32 g)", 190, 7, 7, 16],
  ["Almonds", "1 oz (28 g)", 164, 6, 6, 14],
  ["Cheddar cheese", "1 oz (28 g)", 114, 7, 0, 9],
  ["Black beans, cooked", "1/2 cup (86 g)", 114, 8, 20, 0],
  ["Protein bar", "1 bar (60 g)", 210, 20, 22, 7],
  ["Beef jerky", "1 oz (28 g)", 116, 9, 3, 7],
];

export function referenceFoods(now: string): Food[] {
  return REF_FOODS.map(([name, servingSize, calories, protein, carbs, fat]) => ({
    id: uid(),
    createdAt: now,
    updatedAt: now,
    name,
    servingSize,
    calories,
    protein,
    carbs,
    fat,
    source: "reference",
    isFavorite: false,
    useCount: 0,
  }));
}

export function buildProfile(now: string, startDate: string, overrides: Partial<Profile> = {}): Profile {
  return {
    id: "me",
    createdAt: now,
    updatedAt: now,
    ...STARTING_PROFILE,
    startDate,
    schedule: defaultSchedule(),
    reminders: defaultReminders(),
    notificationsEnabled: false,
    onboarded: false,
    ...overrides,
  };
}

export function buildTargets(now: string, effectiveFrom: string, overrides: Partial<Targets> = {}): Targets {
  return {
    id: uid(),
    createdAt: now,
    updatedAt: now,
    effectiveFrom,
    ...STARTING_TARGETS,
    ...overrides,
  };
}
