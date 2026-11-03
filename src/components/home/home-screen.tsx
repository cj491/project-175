"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Droplet, Dumbbell, Flame, Footprints, Moon, Plus, Scale, Shield, Timer, Zap, Check, HeartPulse } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ActivityRings, ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Chip, EstimateTag } from "@/components/ui/misc";
import { MissionsCard } from "@/components/gamification/missions-card";
import { useLoadedData } from "@/components/providers/data-provider";
import { useUI } from "@/components/providers/ui-provider";
import { coachMessages, transformation } from "@/lib/domain/analytics";
import { dayTotals, waterOn } from "@/lib/domain/nutrition";
import { stepsOn, walkMinutesOn } from "@/lib/domain/activity";
import { completedSessions } from "@/lib/domain/workout";
import { allStreaks } from "@/lib/gamification/streaks";
import { levelFor } from "@/lib/gamification/levels";
import { formatDate, weekdayIndex } from "@/lib/dates";
import { cn, fmt, sum } from "@/lib/utils";

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Late night";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export function HomeScreen() {
  const { data, today, profile, targets } = useLoadedData();
  const { openSheet } = useUI();
  const tr = transformation(data, today)!;
  const totals = dayTotals(data.foodEntries, today);
  const steps = stepsOn(data.steps, today);
  const walkMin = walkMinutesOn(data.walks, today);
  const water = waterOn(data.water, today);
  const xp = sum(data.xp, (x) => x.amount);
  const lvl = levelFor(xp);
  const streaks = allStreaks(data, today, targets.strengthPerWeek);
  const dayPlan = profile.schedule[weekdayIndex(today)];
  const todayTemplate = data.templates.find((t) => t.id === dayPlan.templateId);
  const workoutDone = completedSessions(data.sessions).some((s) => s.date === today);
  const activeSession = data.sessions.find((s) => s.status === "active");
  const messages = coachMessages(data, today);
  const calLeft = targets.calories - totals.calories;
  const proteinLeft = Math.max(0, targets.protein - totals.protein);
  const checkedIn = data.checkins.some((c) => c.date === today);

  return (
    <Page>
      <PageHeader
        subtitle={`${formatDate(today, { weekday: "long", month: "long", day: "numeric" })}`}
        title={`${greeting()}${profile.name ? `, ${profile.name}` : ""}`}
        action={
          <Chip tone={streaks.activity.current > 0 ? "amber" : "default"} className="h-10 rounded-full px-3 text-sm">
            <Flame size={16} className={streaks.activity.current > 0 ? "fill-amber" : ""} />
            <span className="num">{streaks.activity.current}</span>
          </Chip>
        }
      />

      {/* Level strip */}
      <Link href="/profile#achievements" className="mb-4 flex items-center gap-4 rounded-3xl border border-line bg-surface px-5 py-4 transition-colors hover:bg-surface-2">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-lime/30 bg-lime/10">
          <span className="num text-xl font-bold text-lime">{lvl.level}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <p className="truncate font-semibold">{lvl.name}</p>
            <p className="num shrink-0 text-xs text-muted">
              {lvl.next ? `${fmt(lvl.next.minXp - xp)} XP to level ${lvl.next.level}` : "Max level"}
            </p>
          </div>
          <ProgressBar value={lvl.progress} color="var(--color-xp)" height={7} label="XP to next level" />
        </div>
        <div className="num hidden shrink-0 items-center gap-1 text-sm font-semibold text-xp sm:flex">
          <Zap size={14} fill="currentColor" />
          {fmt(xp)}
        </div>
      </Link>

      {streaks.activity.atRisk && streaks.activity.current >= 2 && (
        <div className="mb-4 flex items-center gap-3 rounded-2xl border border-amber/25 bg-amber/5 px-4 py-3 text-sm">
          <Flame size={18} className="shrink-0 text-amber" />
          <p className="flex-1">
            Your <span className="font-semibold">{streaks.activity.current}-day streak</span> is alive — log anything today to extend it.
            {streaks.activity.shields > 0 && <span className="text-muted"> You have {streaks.activity.shields} streak shield{streaks.activity.shields > 1 ? "s" : ""} as backup.</span>}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Calories & macros */}
        <Card className="lg:col-span-7">
          <CardHeader
            title="Nutrition today"
            subtitle={`${fmt(totals.calories)} of ${fmt(targets.calories)} kcal`}
            action={
              <Button size="sm" onClick={() => openSheet("food")}>
                <Plus size={16} /> Log food
              </Button>
            }
          />
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <ProgressRing value={totals.calories / targets.calories} size={176} stroke={16} color={calLeft < 0 ? "var(--color-amber)" : "var(--color-lime)"} label="Calories consumed">
              <div className="text-center">
                <p className="num text-4xl font-bold leading-none">{fmt(Math.abs(calLeft))}</p>
                <p className="mt-1 text-xs font-medium text-muted">{calLeft >= 0 ? "kcal left" : "kcal over"}</p>
              </div>
            </ProgressRing>
            <div className="w-full flex-1 space-y-4">
              {(
                [
                  ["Protein", totals.protein, targets.protein, "var(--color-protein)"],
                  ["Carbs", totals.carbs, targets.carbs, "var(--color-carbs)"],
                  ["Fat", totals.fat, targets.fat, "var(--color-fat)"],
                ] as const
              ).map(([label, val, target, color]) => (
                <div key={label}>
                  <div className="mb-1.5 flex items-baseline justify-between text-sm">
                    <span className="font-medium">{label}</span>
                    <span className="num text-muted">
                      <span className="font-semibold text-fg">{fmt(val)}</span> / {target} g
                      <span className="ml-2 text-xs text-subtle">{val >= target ? "done" : `${fmt(target - val)} left`}</span>
                    </span>
                  </div>
                  <ProgressBar value={val / target} color={color} height={label === "Protein" ? 10 : 7} label={`${label} progress`} />
                </div>
              ))}
            </div>
          </div>
          {proteinLeft > 0 && totals.calories > 0 && (
            <p className="mt-5 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
              <span className="font-semibold text-protein">{fmt(proteinLeft)} g protein</span> to go{calLeft > 0 ? ` with ${fmt(calLeft)} kcal left` : ""}.
            </p>
          )}
        </Card>

        {/* Transformation */}
        <Card className="lg:col-span-5">
          <CardHeader
            title="Transformation"
            subtitle={tr.started ? `Day ${tr.day} of ${tr.totalDays}` : `Starts ${formatDate(profile.startDate)}`}
            action={
              <Button variant="secondary" size="sm" onClick={() => openSheet("weight")}>
                <Scale size={15} /> Weigh in
              </Button>
            }
          />
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-medium text-muted">Current</p>
              <p className="num text-5xl font-bold leading-none tracking-tight">
                {fmt(tr.current, 1)}
                <span className="ml-1 text-lg font-medium text-subtle">lb</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium text-muted">Goal</p>
              <p className="num text-2xl font-semibold text-lime">{tr.goal}</p>
            </div>
          </div>
          <div className="mt-5">
            <ProgressBar value={tr.progress} height={10} label="Progress to goal weight" />
            <div className="num mt-2 flex justify-between text-xs text-subtle">
              <span>{tr.start} start</span>
              <span>{Math.round(tr.progress * 100)}% there</span>
            </div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            {[
              ["Lost", tr.lost > 0 ? `${fmt(tr.lost, 1)}` : "0", "lb"],
              ["To go", fmt(tr.remaining, 1), "lb"],
              ["Timeline", `${Math.round(tr.timePct * 100)}`, "%"],
            ].map(([l, v, u]) => (
              <div key={l} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                <p className="text-[11px] font-medium text-muted">{l}</p>
                <p className="num text-lg font-semibold">
                  {v}
                  <span className="ml-0.5 text-xs text-subtle">{u}</span>
                </p>
              </div>
            ))}
          </div>
        </Card>

        {/* Missions */}
        <MissionsCard className="lg:col-span-7 lg:row-span-2" />

        {/* Today's plan */}
        <Card className="lg:col-span-5">
          <CardHeader title="Today's plan" subtitle={dayPlan.label} icon={dayPlan.type === "rest" ? <Moon size={16} /> : dayPlan.type === "strength" ? <Dumbbell size={16} /> : <Footprints size={16} />} />
          {activeSession ? (
            <Link href="/training/session" className="flex items-center justify-between rounded-2xl bg-lime px-4 py-4 font-semibold text-lime-ink">
              <span>Resume {activeSession.name}</span>
              <ArrowRight size={18} />
            </Link>
          ) : workoutDone ? (
            <div className="flex items-center gap-3 rounded-2xl bg-emerald/10 px-4 py-3.5 text-emerald">
              <Check size={20} strokeWidth={3} />
              <span className="font-semibold">Workout complete. That&apos;s discipline.</span>
            </div>
          ) : dayPlan.type === "strength" && todayTemplate ? (
            <>
              <ul className="mb-4 space-y-1.5 text-sm text-muted">
                {todayTemplate.exercises.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex justify-between">
                    <span className="truncate">{e.name}</span>
                    <span className="num shrink-0 text-subtle">
                      {e.sets} × {e.repMin}–{e.repMax}
                      {e.unit === "seconds" ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href={`/training?start=${todayTemplate.id}`} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-lime font-semibold text-lime-ink transition-transform active:scale-[0.98]">
                <Dumbbell size={18} /> Start {todayTemplate.name}
              </Link>
            </>
          ) : dayPlan.type === "rest" ? (
            <p className="text-sm text-muted">Recovery day. Easy movement, good food, and prepare for the week ahead.</p>
          ) : (
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => openSheet("walk")}>
                <Timer size={17} /> Log walk
              </Button>
              {dayPlan.type === "optional" && (
                <Link href="/training" className="flex h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-line bg-surface-3 text-[15px] font-semibold">
                  <Dumbbell size={17} /> Bonus
                </Link>
              )}
            </div>
          )}
          <div className="mt-4 rounded-2xl border border-line bg-surface-2 px-4 py-3">
            <p className="text-sm leading-relaxed">{messages[0]}</p>
            {messages[1] && <p className="mt-1 text-sm leading-relaxed text-muted">{messages[1]}</p>}
          </div>
        </Card>

        {/* Activity */}
        <Card className="lg:col-span-5">
          <CardHeader title="Activity" subtitle="Manual entries" />
          <div className="flex items-center gap-5">
            <ActivityRings
              size={124}
              stroke={13}
              rings={[
                { value: steps / targets.steps, color: "var(--color-steps)", label: "Steps" },
                { value: walkMin / targets.walkMinutes, color: "var(--color-lime)", label: "Walking minutes" },
                { value: water / targets.waterMl, color: "var(--color-water)", label: "Water" },
              ]}
            />
            <div className="grid flex-1 gap-2.5">
              <button type="button" onClick={() => openSheet("steps")} className="flex items-center justify-between text-left">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2 w-2 rounded-full bg-steps" /> Steps
                </span>
                <span className="num text-sm font-semibold">
                  {fmt(steps)}
                  <span className="text-subtle">/{fmt(targets.steps / 1000, 1)}k</span>
                </span>
              </button>
              <button type="button" onClick={() => openSheet("walk")} className="flex items-center justify-between text-left">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2 w-2 rounded-full bg-lime" /> Walking
                </span>
                <span className="num text-sm font-semibold">
                  {walkMin}
                  <span className="text-subtle">/{targets.walkMinutes} min</span>
                </span>
              </button>
              <button type="button" onClick={() => openSheet("water")} className="flex items-center justify-between text-left">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <span className="h-2 w-2 rounded-full bg-water" /> Water
                </span>
                <span className="num text-sm font-semibold">
                  {fmt(water / 1000, 2)}
                  <span className="text-subtle">/{fmt(targets.waterMl / 1000, 1)} L</span>
                </span>
              </button>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm text-muted">
                  <Dumbbell size={12} /> Workout
                </span>
                <span className={cn("text-sm font-semibold", workoutDone ? "text-emerald" : "text-subtle")}>{workoutDone ? "Done" : dayPlan.type === "strength" ? "Planned" : "—"}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button variant="secondary" size="sm" onClick={() => openSheet("water")}>
              <Droplet size={15} className="text-water" /> Water
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openSheet("steps")}>
              <Footprints size={15} className="text-steps" /> Steps
            </Button>
            <Button variant="secondary" size="sm" onClick={() => openSheet("walk")}>
              <Timer size={15} className="text-lime" /> Walk
            </Button>
          </div>
        </Card>

        {/* Streaks */}
        <Card className="lg:col-span-12">
          <CardHeader
            title="Streaks"
            subtitle="Streak shields protect you from a single missed day"
            action={
              !checkedIn ? (
                <Button variant="secondary" size="sm" onClick={() => openSheet("checkin")}>
                  <HeartPulse size={15} /> Check in
                </Button>
              ) : undefined
            }
          />
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {[
              { label: "Daily activity", value: streaks.activity.current, unit: "days", best: streaks.activity.best, icon: Flame, color: "text-amber" },
              { label: "Nutrition logging", value: streaks.nutrition.current, unit: "days", best: streaks.nutrition.best, icon: Flame, color: "text-protein" },
              { label: "Workout consistency", value: streaks.workout, unit: "sessions", icon: Dumbbell, color: "text-lime" },
              { label: "Weekly target", value: streaks.weekly.streak, unit: "weeks", sub: `${streaks.weekly.thisWeek}/${targets.strengthPerWeek} this week`, icon: Zap, color: "text-xp" },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl bg-surface-2 p-4">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
                  <s.icon size={14} className={s.color} /> {s.label}
                </div>
                <p className="num text-3xl font-bold">
                  {s.value}
                  <span className="ml-1 text-sm font-medium text-subtle">{s.unit}</span>
                </p>
                <p className="mt-0.5 text-xs text-subtle">{s.sub ?? (s.best !== undefined ? `Best: ${s.best}` : "Scheduled days hit")}</p>
              </div>
            ))}
          </div>
          {streaks.activity.shields > 0 && (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted">
              <Shield size={15} className="text-steps" /> {streaks.activity.shields} streak shield{streaks.activity.shields > 1 ? "s" : ""} banked — earned every 7 active days.
            </p>
          )}
          <p className="mt-3 flex items-center text-xs text-subtle">
            Calorie and body composition figures are targets and estimates, not measurements <EstimateTag />
          </p>
        </Card>
      </div>
    </Page>
  );
}
