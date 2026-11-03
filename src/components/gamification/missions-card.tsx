"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Sparkles, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import { useLoadedData } from "@/components/providers/data-provider";
import { useUI, type SheetName } from "@/components/providers/ui-provider";
import { buildDailyMissions, XP, type Mission } from "@/lib/gamification/missions";
import { MISSION_ICONS } from "./icons";
import { cn, sum } from "@/lib/utils";
import type { MealCategory } from "@/lib/types";

export function MissionsCard({ className }: { className?: string }) {
  const { data, today } = useLoadedData();
  const { openSheet } = useUI();
  const router = useRouter();
  const missions = buildDailyMissions(data, today);
  const done = missions.filter((m) => m.complete).length;
  const allDone = done === missions.length && missions.length > 0;
  const bonusClaimed = data.xp.some((x) => x.id === `allmissions:${today}`);
  const xpToday = sum(data.xp.filter((x) => x.date === today), (x) => x.amount);

  const act = (m: Mission) => {
    const sheetFor: Record<string, SheetName> = { water: "water", steps: "steps", walk: "walk", checkin: "checkin" };
    if (m.type.startsWith("meal_")) return openSheet("food", { meal: m.type.replace("meal_", "") as MealCategory });
    if (m.type === "protein" || m.type === "calories") return openSheet("food");
    if (sheetFor[m.type]) return openSheet(sheetFor[m.type]);
    router.push(m.href);
  };

  return (
    <Card className={cn("p-0", className)}>
      <div className="flex items-center justify-between px-5 pb-3 pt-5">
        <div>
          <h2 className="text-[15px] font-semibold tracking-tight">Daily missions</h2>
          <p className="text-[13px] text-muted">
            {done} of {missions.length} complete
          </p>
        </div>
        <div className="num flex items-center gap-1.5 rounded-full bg-xp/10 px-3 py-1.5 text-sm font-semibold text-xp">
          <Zap size={14} fill="currentColor" /> {xpToday} XP today
        </div>
      </div>
      <div className="px-5 pb-3">
        <ProgressBar value={missions.length ? done / missions.length : 0} color="var(--color-xp)" height={6} label="Missions progress" />
      </div>
      <ul className="px-2 pb-2">
        {missions.map((m) => {
          const Icon = MISSION_ICONS[m.icon];
          return (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => act(m)}
                className={cn("group flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2", m.complete && "opacity-90")}
              >
                <div
                  className={cn(
                    "relative grid h-10 w-10 shrink-0 place-items-center rounded-xl transition-all",
                    m.complete ? "bg-lime text-lime-ink" : "bg-surface-3 text-muted"
                  )}
                >
                  {m.complete ? <Check size={20} strokeWidth={3} className="animate-pop" /> : <Icon size={19} />}
                  {!m.complete && m.progress > 0 && (
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 40 40" aria-hidden>
                      <rect x="1" y="1" width="38" height="38" rx="11" fill="none" stroke="var(--color-lime)" strokeWidth="2" pathLength={100} strokeDasharray={`${m.progress * 100} 100`} />
                    </svg>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn("truncate text-[15px] font-medium", m.complete && "text-muted line-through decoration-subtle")}>{m.title}</p>
                  <p className="truncate text-xs text-subtle">{m.detail}</p>
                </div>
                <span className={cn("num shrink-0 text-xs font-bold", m.claimed ? "text-xp" : "text-subtle")}>+{m.xp}</span>
                {!m.complete && <ChevronRight size={16} className="shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />}
              </button>
            </li>
          );
        })}
      </ul>
      <div className={cn("mx-3 mb-3 flex items-center gap-3 rounded-2xl border px-4 py-3", allDone ? "border-xp/40 bg-xp/10" : "border-dashed border-line-strong")}>
        <Sparkles size={18} className={allDone ? "text-xp" : "text-subtle"} />
        <p className="flex-1 text-sm">
          {allDone ? (bonusClaimed ? "Perfect day — bonus collected!" : "Perfect day!") : <span className="text-muted">Complete every mission for a bonus</span>}
        </p>
        <span className={cn("num text-sm font-bold", allDone ? "text-xp" : "text-subtle")}>+{XP.allMissions}</span>
      </div>
    </Card>
  );
}
