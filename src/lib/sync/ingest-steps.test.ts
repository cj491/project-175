import { describe, expect, it } from "vitest";
import { localDate, parseSteps, resolveDate, shouldWrite } from "../../../supabase/functions/ingest-steps/parse";

describe("Shortcut step parsing", () => {
  it("reads the formats Shortcuts produces", () => {
    expect(parseSteps("8234")).toBe(8234);
    expect(parseSteps("8,234")).toBe(8234);
    expect(parseSteps("8 234")).toBe(8234);
    expect(parseSteps("8 234")).toBe(8234);
    expect(parseSteps("8.234")).toBe(8234);
    expect(parseSteps("8234 steps")).toBe(8234);
    expect(parseSteps("8234.0")).toBe(8234);
    expect(parseSteps("12,345.6 count")).toBe(12346);
    expect(parseSteps("0")).toBe(0);
  });

  it("rejects missing or absurd values", () => {
    expect(parseSteps(null)).toBeNull();
    expect(parseSteps("")).toBeNull();
    expect(parseSteps("steps")).toBeNull();
    expect(parseSteps("999999")).toBeNull();
  });

  it("resolves dates in the user's time zone", () => {
    const now = new Date("2026-11-04T03:30:00Z"); // 10:30pm Nov 3 in Toronto
    expect(localDate(now, "America/Toronto")).toBe("2026-11-03");
    expect(resolveDate(null, now, "America/Toronto")).toBe("2026-11-03");
    expect(resolveDate("yesterday", now, "America/Toronto")).toBe("2026-11-02");
    expect(resolveDate("2026-10-31", now, "America/Toronto")).toBe("2026-10-31");
    expect(resolveDate("2026-10-01", now, "America/Toronto")).toBeNull();
    expect(resolveDate("2026-11-05", now, "America/Toronto")).toBeNull();
    expect(resolveDate("nonsense", now, "America/Toronto")).toBeNull();
  });

  it("only replaces a manual entry with a higher count", () => {
    expect(shouldWrite(null, 5000)).toBe(true);
    expect(shouldWrite({ steps: 9000, source: "manual" }, 8000)).toBe(false);
    expect(shouldWrite({ steps: 3000, source: "manual" }, 8000)).toBe(true);
    expect(shouldWrite({ steps: 8000, source: "apple_health" }, 8000)).toBe(false);
    expect(shouldWrite({ steps: 8000, source: "apple_health" }, 7900)).toBe(true);
  });
});
