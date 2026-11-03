/**
 * Pure reminder logic shared by the send-reminders edge function and tests.
 * No Deno or Node APIs here.
 */

export interface Reminder {
  id: string;
  label: string;
  time: string; // HH:MM
  enabled: boolean;
  kind: "workout" | "protein" | "water" | "checkin" | "steps" | "custom";
}

export interface UserDay {
  reminders: Reminder[];
  schedule: { type: string; label: string }[]; // Monday-first
  targets: { protein: number; waterMl: number; steps: number } | null;
  protein: number;
  waterMl: number;
  steps: number;
  workoutDone: boolean;
  checkedIn: boolean;
}

/** Local date (YYYY-MM-DD), minutes since midnight and Monday-first weekday in a timezone. */
export function localNow(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(now)
      .map((p) => [p.type, p.value])
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute), weekday };
}

/** Reminders whose time fell within the last `windowMin` minutes. */
export function dueReminders(reminders: Reminder[], minutesNow: number, windowMin = 15) {
  return reminders.filter((r) => {
    if (!r.enabled) return false;
    const [h, m] = r.time.split(":").map(Number);
    const diff = minutesNow - (h * 60 + m);
    return diff >= 0 && diff < windowMin;
  });
}

/** Returns the message to send, or null when the reminder is no longer needed. */
export function reminderText(r: Reminder, d: UserDay, weekday: number): string | null {
  const t = d.targets;
  switch (r.kind) {
    case "workout": {
      const day = d.schedule[weekday];
      if (!day || day.type !== "strength" || d.workoutDone) return null;
      return `${day.label}: your workout is waiting.`;
    }
    case "protein": {
      const left = t ? Math.round(t.protein - d.protein) : 0;
      return left > 0 ? `You're ${left} g away from your protein goal.` : null;
    }
    case "water": {
      const left = t ? t.waterMl - d.waterMl : 0;
      return left > 0 ? `${(left / 1000).toFixed(1)} L of water to go today.` : null;
    }
    case "steps": {
      const left = t ? t.steps - d.steps : 0;
      return left > 0 ? `${left.toLocaleString("en-US")} steps to your goal — a short walk gets you closer.` : null;
    }
    case "checkin":
      return d.checkedIn ? null : "Time for your evening check-in.";
    case "custom":
      return r.label || null;
    default:
      return null;
  }
}
