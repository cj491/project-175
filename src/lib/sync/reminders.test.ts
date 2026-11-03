import { describe, expect, it } from "vitest";
import { dueReminders, localNow, reminderText, type Reminder, type UserDay } from "../../../supabase/functions/send-reminders/relevance";

const r = (kind: Reminder["kind"], time = "15:00"): Reminder => ({ id: kind, label: "Custom", time, enabled: true, kind });
const day = (patch: Partial<UserDay> = {}): UserDay => ({
  reminders: [],
  schedule: [{ type: "strength", label: "Strength A" }, { type: "walk", label: "Walk" }],
  targets: { protein: 175, waterMl: 3000, steps: 8000 },
  protein: 0,
  waterMl: 0,
  steps: 0,
  workoutDone: false,
  checkedIn: false,
  ...patch,
});

describe("background reminder rules", () => {
  it("converts to the user's local time", () => {
    const t = localNow(new Date("2026-11-03T20:05:00Z"), "America/Toronto"); // EST, UTC-5
    expect(t).toEqual({ date: "2026-11-03", minutes: 15 * 60 + 5, weekday: 1 });
  });

  it("finds reminders due in the last 15 minutes only", () => {
    const list = [r("protein", "15:00"), r("water", "14:40"), { ...r("checkin", "15:00"), enabled: false }];
    expect(dueReminders(list, 15 * 60 + 5).map((x) => x.id)).toEqual(["protein"]);
  });

  it("skips reminders that no longer apply", () => {
    expect(reminderText(r("protein"), day({ protein: 140 }), 0)).toBe("You're 35 g away from your protein goal.");
    expect(reminderText(r("protein"), day({ protein: 180 }), 0)).toBeNull();
    expect(reminderText(r("workout"), day(), 0)).toBe("Strength A: your workout is waiting.");
    expect(reminderText(r("workout"), day({ workoutDone: true }), 0)).toBeNull();
    expect(reminderText(r("workout"), day(), 1)).toBeNull(); // walk day
    expect(reminderText(r("checkin"), day({ checkedIn: true }), 0)).toBeNull();
    expect(reminderText(r("water"), day({ waterMl: 2500 }), 0)).toBe("0.5 L of water to go today.");
  });
});
