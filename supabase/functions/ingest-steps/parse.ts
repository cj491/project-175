/** Pure helpers for ingest-steps (no Deno/Node APIs) — unit tested in src/lib/sync. */

/**
 * Shortcuts passes Health values as text that varies by locale and version:
 * "8234", "8,234", "8 234", "8.234", "8234 steps", "8234.0". Returns a whole
 * step count, or null if it can't be read.
 */
export function parseSteps(input: string | null | undefined): number | null {
  if (input == null) return null;
  const s = String(input).replace(/ | /g, " ").trim();
  const m = s.match(/\d[\d.,' ]*/);
  if (!m) return null;
  let token = m[0].trim();
  // A trailing 1–2 digit fraction ("8234.0", "8234,5") is a decimal, not a thousands group.
  const dec = token.match(/^(\d[\d.,' ]*?)[.,](\d{1,2})$/);
  let value: number;
  if (dec) {
    value = Math.round(Number(`${dec[1].replace(/\D/g, "")}.${dec[2]}`));
  } else {
    token = token.replace(/\D/g, "");
    value = Number(token);
  }
  if (!Number.isFinite(value) || value < 0 || value > 150000) return null;
  return value;
}

/** Local calendar date (YYYY-MM-DD) in a timezone, optionally shifted by days. */
export function localDate(now: Date, timeZone: string, offsetDays = 0) {
  const d = new Date(now.getTime() + offsetDays * 86_400_000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((p) => [p.type, p.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Accepts an explicit YYYY-MM-DD within the last week; otherwise uses today. */
export function resolveDate(param: string | null, now: Date, timeZone: string) {
  const today = localDate(now, timeZone);
  if (!param) return today;
  if (param === "yesterday") return localDate(now, timeZone, -1);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(param)) return null;
  const earliest = localDate(now, timeZone, -7);
  return param >= earliest && param <= today ? param : null;
}

/** Health data only replaces a manual entry when it reports more steps. */
export function shouldWrite(existing: { steps?: number; source?: string } | null, steps: number) {
  if (!existing) return true;
  if (existing.source === "manual" && (existing.steps ?? 0) >= steps) return false;
  return existing.steps !== steps || existing.source !== "apple_health";
}
