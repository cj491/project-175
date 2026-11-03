export interface Level {
  level: number;
  name: string;
  minXp: number;
}

export const LEVELS: Level[] = [
  { level: 1, name: "Beginner", minXp: 0 },
  { level: 2, name: "Building Momentum", minXp: 200 },
  { level: 3, name: "Disciplined", minXp: 500 },
  { level: 4, name: "Consistent", minXp: 900 },
  { level: 5, name: "Stronger Every Day", minXp: 1400 },
  { level: 6, name: "Unstoppable", minXp: 2000 },
  { level: 7, name: "Relentless", minXp: 2800 },
  { level: 8, name: "Iron Habit", minXp: 3800 },
  { level: 9, name: "Elite Routine", minXp: 5000 },
  { level: 10, name: "Transformation Mode", minXp: 6500 },
  { level: 11, name: "Built Different", minXp: 8500 },
  { level: 12, name: "Peak Form", minXp: 11000 },
  { level: 13, name: "Legend in Progress", minXp: 14000 },
  { level: 14, name: "Project 175", minXp: 18000 },
];

export function levelFor(xp: number) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.minXp) cur = l;
  const next = LEVELS.find((l) => l.level === cur.level + 1) ?? null;
  const into = xp - cur.minXp;
  const span = next ? next.minXp - cur.minXp : 1;
  return { ...cur, next, xpIntoLevel: into, xpForLevel: span, progress: next ? into / span : 1 };
}
