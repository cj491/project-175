"use client";

import * as React from "react";
import { useAppData } from "@/components/providers/data-provider";
import { eligibleRewards } from "@/lib/gamification/missions";
import { ACHIEVEMENTS, isEarned } from "@/lib/gamification/achievements";
import { awardXp, unlockAchievement } from "@/lib/db/repo";
import { toast } from "@/lib/events";
import { currentWeight } from "@/lib/domain/analytics";
import { sum } from "@/lib/utils";

/**
 * Watches the user's data and grants rewards as soon as they're earned.
 * Idempotent: XP ids and achievement ids are primary keys, so re-running
 * (e.g. on every data change or in React StrictMode) never double-awards.
 */
export function RewardsEngine() {
  const { data, today } = useAppData();
  const inFlight = React.useRef(new Set<string>());

  React.useEffect(() => {
    if (!data?.profile?.onboarded) return;
    const have = new Set(data.xp.map((x) => x.id));
    const pending = eligibleRewards(data, today).filter((r) => !have.has(r.id) && !inFlight.current.has(r.id));
    for (const r of pending) {
      inFlight.current.add(r.id);
      awardXp(r)
        .then((ok) => {
          if (ok) toast({ kind: "xp", title: r.label, amount: r.amount });
        })
        .catch((e) => console.error("XP award failed", e))
        .finally(() => inFlight.current.delete(r.id));
    }

    const unlocked = new Set(data.achievements.map((a) => a.id));
    const ctx = { today, totalXp: sum(data.xp, (x) => x.amount), currentWeight: currentWeight(data) };
    for (const def of ACHIEVEMENTS) {
      const key = `ach:${def.id}`;
      if (unlocked.has(def.id) || inFlight.current.has(key)) continue;
      if (!isEarned(def, data, ctx)) continue;
      inFlight.current.add(key);
      unlockAchievement(def.id)
        .catch((e) => console.error("Achievement unlock failed", e))
        .finally(() => inFlight.current.delete(key));
    }
  }, [data, today]);

  return null;
}
