import { z } from "zod";

const num = (min: number, max: number, label: string) =>
  z.coerce
    .number({ message: `${label} must be a number` })
    .refine((n) => Number.isFinite(n), `${label} must be a number`)
    .min(min, `${label} must be at least ${min}`)
    .max(max, `${label} must be at most ${max}`);

export const macrosSchema = z.object({
  calories: num(0, 5000, "Calories"),
  protein: num(0, 500, "Protein"),
  carbs: num(0, 800, "Carbs"),
  fat: num(0, 400, "Fat"),
});

export const foodSchema = macrosSchema.extend({
  name: z.string().trim().min(1, "Name is required").max(80),
  brand: z.string().trim().max(60).optional(),
  servingSize: z.string().trim().min(1, "Serving size is required").max(40),
});

export const servingsSchema = num(0.1, 20, "Servings");

export const weightSchema = num(70, 600, "Weight");
export const stepsSchema = num(0, 100000, "Steps");
export const walkMinutesSchema = num(1, 600, "Minutes");
export const waterSchema = num(1, 5000, "Water");

export const targetsSchema = z.object({
  calories: num(1000, 6000, "Calories"),
  protein: num(30, 400, "Protein"),
  carbs: num(0, 800, "Carbs"),
  fat: num(10, 300, "Fat"),
  waterMl: num(500, 8000, "Water"),
  steps: num(1000, 50000, "Step goal"),
  walkMinutes: num(5, 180, "Walk minutes"),
  strengthPerWeek: num(1, 7, "Strength sessions"),
});

export const profileSchema = z.object({
  name: z.string().trim().max(40),
  age: num(13, 100, "Age"),
  heightIn: num(48, 96, "Height"),
  startWeightLb: num(70, 600, "Starting weight"),
  goalWeightLb: num(70, 600, "Goal weight"),
  targetBodyFatPct: num(3, 60, "Body fat target"),
  timelineDays: num(28, 730, "Timeline"),
  walkPaceMph: num(1, 6, "Walking pace"),
});

export const measurementSchema = z.object({
  waistIn: num(15, 80, "Waist").optional(),
  chestIn: num(15, 80, "Chest").optional(),
  hipsIn: num(15, 80, "Hips").optional(),
  armIn: num(5, 40, "Arm").optional(),
  thighIn: num(10, 50, "Thigh").optional(),
  bodyFatPctEstimate: num(3, 60, "Body fat estimate").optional(),
  notes: z.string().max(280).optional(),
});

export const importSchema = z.object({
  app: z.literal("project-175"),
  version: z.number(),
  data: z.record(z.string(), z.array(z.unknown())),
});

/** Returns either parsed data or the first error message. */
export function validate<T>(schema: z.ZodType<T>, value: unknown): { ok: true; data: T } | { ok: false; error: string } {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: r.error.issues[0]?.message ?? "Invalid value" };
}

/** Empty strings become undefined so optional numeric fields validate. */
export function blankToUndef<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[k] = v === "" || v === null ? undefined : v;
  return out as T;
}
