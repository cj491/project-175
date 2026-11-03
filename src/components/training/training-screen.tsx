"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowRight, Check, ChevronDown, Dumbbell, History, Minus, Moon, Pencil, Play, Plus, Footprints, Trash2, Trophy, TrendingUp, CalendarCog } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input, Segmented } from "@/components/ui/form";
import { Chip, EmptyState } from "@/components/ui/misc";
import { useLoadedData } from "@/components/providers/data-provider";
import { addDays, formatDate, formatDuration, startOfWeek, weekdayIndex, weekdayName } from "@/lib/dates";
import {
  completedSessions,
  compareOverload,
  exerciseHistory,
  formatPrescription,
  formatSet,
  nextTimeSuggestion,
  OVERLOAD_LABEL,
  personalRecords,
  sessionDurationSec,
  sessionProgress,
  sessionVolume,
  type ExercisePerformance,
  type OverloadStatus,
} from "@/lib/domain/workout";
import { createTemplate, deleteSession, deleteTemplate, saveTemplate, startSession, updateProfile } from "@/lib/db/repo";
import { toast } from "@/lib/events";
import { getDB } from "@/lib/db/db";
import type { DayType, ScheduleDay, TemplateExercise, WorkoutSession, WorkoutTemplate, SessionExercise } from "@/lib/types";
import { cn, fmt, normaliseKey, uid } from "@/lib/utils";

export const OVERLOAD_TONE: Record<OverloadStatus, "emerald" | "lime" | "default" | "amber"> = {
  weight_up: "emerald",
  reps_up: "lime",
  maintained: "default",
  declined: "amber",
  first: "default",
};

export function OverloadChip({ status }: { status: OverloadStatus }) {
  const Icon = status === "weight_up" || status === "reps_up" ? TrendingUp : status === "declined" ? ArrowDown : Minus;
  return (
    <Chip tone={OVERLOAD_TONE[status]}>
      <Icon size={12} /> {OVERLOAD_LABEL[status]}
    </Chip>
  );
}

/** Pre-fills each set's weight from the last time this exercise was done. */
export function usePrefill() {
  const { data } = useLoadedData();
  const history = React.useMemo(() => exerciseHistory(data.sessions), [data.sessions]);
  return React.useCallback(
    (ex: SessionExercise): SessionExercise => {
      const last = history.get(ex.exerciseKey)?.at(-1);
      if (!last) return ex;
      const bump = last.hitTopOfRange && last.unit === "reps" && last.topWeight > 0;
      return {
        ...ex,
        sets: ex.sets.map((s, i) => {
          const prev = last.sets[Math.min(i, last.sets.length - 1)];
          const w = prev?.weight ?? null;
          return { ...s, weight: w === null ? null : bump ? w + 5 : w };
        }),
      };
    },
    [history]
  );
}

export function TrainingScreen() {
  const { data, today, profile, targets } = useLoadedData();
  const router = useRouter();
  const prefill = usePrefill();
  const [editingTpl, setEditingTpl] = React.useState<WorkoutTemplate | null>(null);
  const [scheduleOpen, setScheduleOpen] = React.useState(false);
  const [historyKey, setHistoryKey] = React.useState<string | null>(null);
  const [viewSession, setViewSession] = React.useState<WorkoutSession | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const active = data.sessions.find((s) => s.status === "active");
  const history = React.useMemo(() => exerciseHistory(data.sessions), [data.sessions]);
  const prs = React.useMemo(() => personalRecords(history), [history]);
  const done = completedSessions(data.sessions);
  const recent = [...data.sessions].filter((s) => s.status === "completed").sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const weekStart = startOfWeek(today);
  const thisWeek = done.filter((s) => s.date >= weekStart && s.date <= today);
  const dayPlan = profile.schedule[weekdayIndex(today)];

  const start = React.useCallback(
    async (tpl: WorkoutTemplate | undefined) => {
      if (active) {
        router.push("/training/session");
        return;
      }
      await startSession(tpl, today, prefill);
      router.push("/training/session");
    },
    [active, today, prefill, router]
  );

  // Deep link from Home: /training?start=<templateId>
  const startedFromLink = React.useRef(false);
  React.useEffect(() => {
    if (startedFromLink.current) return;
    const id = new URLSearchParams(window.location.search).get("start");
    if (!id) return;
    startedFromLink.current = true;
    window.history.replaceState(null, "", "/training");
    void start(data.templates.find((t) => t.id === id));
  }, [data.templates, start]);

  return (
    <Page>
      <PageHeader title="Training" subtitle="Get stronger every week" />

      {active && (
        <Link href="/training/session" className="mb-4 flex items-center gap-4 rounded-3xl bg-lime px-5 py-4 text-lime-ink">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-lime-ink/10">
            <Dumbbell size={22} />
          </div>
          <div className="flex-1">
            <p className="font-bold">{active.name} in progress</p>
            <p className="text-sm opacity-75">{Math.round(sessionProgress(active).pct * 100)}% complete · tap to resume</p>
          </div>
          <ArrowRight size={20} />
        </Link>
      )}

      {/* This week */}
      <Card className="mb-4">
        <CardHeader
          title="This week"
          subtitle={`${thisWeek.length} of ${targets.strengthPerWeek} strength sessions${thisWeek.length > targets.strengthPerWeek ? " · bonus earned" : ""}`}
          action={
            <Button variant="ghost" size="sm" onClick={() => setScheduleOpen(true)}>
              <CalendarCog size={16} /> Edit plan
            </Button>
          }
        />
        <div className="grid grid-cols-7 gap-1.5">
          {profile.schedule.map((d, i) => {
            const date = addDays(weekStart, i);
            const did = done.some((s) => s.date === date);
            const walked = data.walks.some((w) => w.date === date);
            const isToday = date === today;
            const past = date < today && date >= profile.startDate;
            const doneDay = d.type === "strength" ? did : d.type === "walk" ? walked : did || walked;
            return (
              <div
                key={i}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-2xl border px-1 py-2.5 text-center",
                  isToday ? "border-lime/50 bg-lime/5" : "border-line bg-surface-2"
                )}
              >
                <span className={cn("text-[11px] font-semibold", isToday ? "text-lime" : "text-subtle")}>{weekdayName(i, true)}</span>
                <div
                  className={cn(
                    "grid h-8 w-8 place-items-center rounded-full text-xs font-bold",
                    doneDay ? "bg-lime text-lime-ink" : d.type === "rest" ? "bg-surface-3 text-subtle" : past ? "border border-dashed border-line-strong text-subtle" : "bg-surface-4 text-fg"
                  )}
                >
                  {doneDay ? (
                    <Check size={15} strokeWidth={3} />
                  ) : d.type === "strength" ? (
                    data.templates.find((t) => t.id === d.templateId)?.shortName ?? "S"
                  ) : d.type === "rest" ? (
                    <Moon size={13} />
                  ) : (
                    <Footprints size={13} />
                  )}
                </div>
                <span className="hidden text-[10px] leading-tight text-subtle sm:block">{d.label}</span>
              </div>
            );
          })}
        </div>
        {!active && (
          <div className="mt-4">
            {dayPlan.type === "strength" ? (
              <Button size="lg" className="w-full" onClick={() => start(data.templates.find((t) => t.id === dayPlan.templateId))}>
                <Play size={18} fill="currentColor" /> Start today&apos;s {dayPlan.label}
              </Button>
            ) : (
              <p className="text-center text-sm text-muted">
                Today: {dayPlan.label}. {dayPlan.type !== "rest" ? "Want extra? Start the bonus session below." : "Rest is part of the plan."}
              </p>
            )}
          </div>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle
            action={
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const id = await createTemplate("Custom workout");
                  setEditingTpl((await getDB().templates.get(id)) ?? null);
                }}
              >
                <Plus size={15} /> New
              </Button>
            }
          >
            Workouts
          </SectionTitle>
          <div className="space-y-3">
            {data.templates.map((t) => {
              const isOpen = expanded === t.id;
              return (
                <Card key={t.id} className="p-0">
                  <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setExpanded(isOpen ? null : t.id)} aria-expanded={isOpen}>
                    <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-lg font-bold", t.isBonus ? "bg-xp/15 text-xp" : "bg-lime/10 text-lime")}>{t.shortName}</div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">
                        {t.name} {t.isBonus && <Chip tone="xp" className="ml-1 py-0.5">Bonus</Chip>}
                      </p>
                      <p className="truncate text-sm text-muted">
                        {t.exercises.length} exercises · {t.description}
                      </p>
                    </div>
                    <ChevronDown size={18} className={cn("text-subtle transition-transform", isOpen && "rotate-180")} />
                  </button>
                  {isOpen && (
                    <div className="border-t border-line px-4 pb-4 pt-3">
                      {t.exercises.length === 0 ? (
                        <p className="py-2 text-sm text-muted">No exercises yet — tap Edit to add some.</p>
                      ) : (
                        <ul className="space-y-2.5">
                          {t.exercises.map((e) => {
                            const last = history.get(normaliseKey(e.name))?.at(-1);
                            return (
                              <li key={e.id} className="flex items-start justify-between gap-3">
                                <button type="button" className="min-w-0 text-left" onClick={() => setHistoryKey(normaliseKey(e.name))}>
                                  <p className="truncate text-[15px] font-medium">{e.name}</p>
                                  <p className="num text-xs text-subtle">{last ? `Last: ${last.sets.map((s) => formatSet(last.unit, s.weight, s.reps)).join(", ")}` : "No history yet"}</p>
                                </button>
                                <span className="num shrink-0 text-sm text-muted">{formatPrescription(e)}</span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      <div className="mt-4 flex gap-2">
                        <Button variant="secondary" onClick={() => setEditingTpl(t)}>
                          <Pencil size={15} /> Edit
                        </Button>
                        <Button className="flex-1" onClick={() => start(t)} disabled={!t.exercises.length}>
                          <Play size={16} fill="currentColor" /> {active ? "Resume active workout" : "Start"}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
            <Button variant="outline" className="w-full" onClick={() => start(undefined)}>
              <Plus size={16} /> Empty workout (add exercises as you go)
            </Button>
          </div>
        </div>

        <div>
          <SectionTitle>Personal records</SectionTitle>
          <Card className="p-0">
            {prs.length === 0 ? (
              <EmptyState icon={<Trophy size={22} />} title="No records yet" description="Finish your first workout and your bests will show up here." />
            ) : (
              <ul className="divide-y divide-line">
                {prs.map((pr) => (
                  <li key={pr.exerciseKey}>
                    <button type="button" onClick={() => setHistoryKey(pr.exerciseKey)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                      <Trophy size={16} className="shrink-0 text-xp" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{pr.name}</p>
                        <p className="num text-xs text-subtle">
                          {pr.unit === "seconds"
                            ? `Best: ${pr.bestReps?.reps ?? 0}s${pr.heaviest?.weight ? ` @ ${pr.heaviest.weight} lb` : ""}`
                            : `Heaviest ${pr.heaviest?.weight ? `${pr.heaviest.weight} lb × ${pr.heaviest.reps}` : "bodyweight"}${pr.best1RM ? ` · est. 1RM ${fmt(pr.best1RM.value)} lb` : ""}`}
                        </p>
                      </div>
                      <ArrowRight size={15} className="text-subtle" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <SectionTitle>
            <span className="flex items-center gap-1.5">Recent sessions</span>
          </SectionTitle>
          <Card className="p-0">
            {recent.length === 0 ? (
              <EmptyState icon={<History size={22} />} title="No sessions yet" description="Your completed workouts will be saved here." />
            ) : (
              <ul className="divide-y divide-line">
                {recent.slice(0, 12).map((s) => {
                  const p = sessionProgress(s);
                  return (
                    <li key={s.id}>
                      <button type="button" onClick={() => setViewSession(s)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-3 text-sm font-bold text-muted">
                          {data.templates.find((t) => t.id === s.templateId)?.shortName ?? <Dumbbell size={16} />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.name}</p>
                          <p className="num text-xs text-subtle">
                            {formatDate(s.date, { weekday: "short", month: "short", day: "numeric" })} · {formatDuration(sessionDurationSec(s))} · {p.done} sets · {fmt(sessionVolume(s))} lb
                          </p>
                        </div>
                        {p.pct < 0.5 && <Chip tone="amber">Partial</Chip>}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <p className="mt-6 text-center text-xs text-subtle">Keep movements pain-free. Don&apos;t push through sharp or worsening pain — adjust range or swap the exercise.</p>

      {editingTpl && <TemplateEditor template={editingTpl} onClose={() => setEditingTpl(null)} />}
      <ScheduleEditor open={scheduleOpen} onClose={() => setScheduleOpen(false)} />
      <ExerciseHistorySheet exerciseKey={historyKey} onClose={() => setHistoryKey(null)} history={history} />
      <SessionDetailSheet session={viewSession} onClose={() => setViewSession(null)} />
    </Page>
  );
}

function ExerciseHistorySheet({ exerciseKey, onClose, history }: { exerciseKey: string | null; onClose: () => void; history: Map<string, ExercisePerformance[]> }) {
  const perfs = exerciseKey ? history.get(exerciseKey) ?? [] : [];
  const name = perfs.at(-1)?.name ?? "Exercise";
  return (
    <Sheet open={!!exerciseKey} onOpenChange={(o) => !o && onClose()} title={name} description={perfs.length ? `${perfs.length} logged session${perfs.length > 1 ? "s" : ""}` : "No history yet"}>
      {perfs.length === 0 ? (
        <EmptyState icon={<History size={22} />} title="No history yet" description="Complete this exercise in a workout to start tracking progress." />
      ) : (
        <>
          {nextTimeSuggestion(perfs.at(-1)) && (
            <div className="mb-4 flex items-start gap-2 rounded-2xl bg-lime/10 px-4 py-3 text-sm text-lime">
              <TrendingUp size={16} className="mt-0.5 shrink-0" /> {nextTimeSuggestion(perfs.at(-1))}
            </div>
          )}
          <ul className="space-y-2">
            {[...perfs].reverse().map((p, i, arr) => {
              const prev = arr[i + 1];
              const status = compareOverload(p, prev);
              return (
                <li key={p.sessionId + i} className="rounded-2xl border border-line bg-surface-2 p-3">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-semibold">{formatDate(p.date, { weekday: "short", month: "short", day: "numeric" })}</span>
                    <OverloadChip status={status} />
                  </div>
                  <p className="num text-sm text-muted">{p.sets.map((s) => formatSet(p.unit, s.weight, s.reps)).join(" · ")}</p>
                  <p className="num mt-1 text-xs text-subtle">
                    Volume {fmt(p.volume)} lb{p.est1RM ? ` · est. 1RM ${fmt(p.est1RM)} lb` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Sheet>
  );
}

function SessionDetailSheet({ session, onClose }: { session: WorkoutSession | null; onClose: () => void }) {
  if (!session) return null;
  return (
    <Sheet
      open={!!session}
      onOpenChange={(o) => !o && onClose()}
      title={session.name}
      description={`${formatDate(session.date, { weekday: "long", month: "short", day: "numeric" })} · ${formatDuration(sessionDurationSec(session))}`}
    >
      <ul className="space-y-2">
        {session.exercises.map((e) => (
          <li key={e.id} className="rounded-2xl border border-line bg-surface-2 p-3">
            <p className="font-medium">
              {e.name} {e.skipped && <Chip className="ml-1">Skipped</Chip>}
              {e.replacedFrom && <span className="ml-1 text-xs text-subtle">(replaced {e.replacedFrom})</span>}
            </p>
            <p className="num mt-1 text-sm text-muted">
              {e.sets.filter((s) => s.done).map((s) => formatSet(e.unit, s.weight, s.reps)).join(" · ") || "No sets completed"}
            </p>
          </li>
        ))}
      </ul>
      <Button
        variant="danger"
        className="mt-4 w-full"
        onClick={async () => {
          if (!confirm("Delete this workout from your history? XP already earned is kept.")) return;
          await deleteSession(session.id);
          toast({ kind: "info", title: "Workout deleted" });
          onClose();
        }}
      >
        <Trash2 size={16} /> Delete workout
      </Button>
    </Sheet>
  );
}

function TemplateEditor({ template, onClose }: { template: WorkoutTemplate; onClose: () => void }) {
  const [t, setT] = React.useState<WorkoutTemplate>(template);
  const [error, setError] = React.useState<string | null>(null);
  const update = (i: number, patch: Partial<TemplateExercise>) => setT((s) => ({ ...s, exercises: s.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) }));
  const move = (i: number, dir: -1 | 1) =>
    setT((s) => {
      const ex = [...s.exercises];
      const j = i + dir;
      if (j < 0 || j >= ex.length) return s;
      [ex[i], ex[j]] = [ex[j], ex[i]];
      return { ...s, exercises: ex };
    });

  const save = async () => {
    if (!t.name.trim()) return setError("Workout name is required");
    for (const e of t.exercises) {
      if (!e.name.trim()) return setError("Every exercise needs a name");
      if (e.sets < 1 || e.sets > 10) return setError(`${e.name}: sets must be 1–10`);
      if (e.repMin < 1 || e.repMax < e.repMin) return setError(`${e.name}: check the rep range`);
    }
    await saveTemplate({ ...t, name: t.name.trim(), shortName: t.shortName.trim().slice(0, 2) || t.name.trim()[0] });
    toast({ kind: "success", title: "Workout saved" });
    onClose();
  };

  return (
    <Sheet
      open
      onOpenChange={(o) => !o && onClose()}
      title="Edit workout"
      size="lg"
      footer={
        <div className="flex gap-2">
          <Button
              variant="danger"
              size="lg"
              onClick={async () => {
                if (!confirm(`Delete ${t.name}? Past sessions stay in your history.`)) return;
                await deleteTemplate(t.id);
                onClose();
              }}
              aria-label="Delete workout"
            >
              <Trash2 size={17} />
            </Button>
          <Button size="lg" className="flex-1" onClick={save}>
            Save workout
          </Button>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-[1fr_80px] gap-3">
        <Field label="Name" htmlFor="te-name">
          <Input id="te-name" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} maxLength={40} />
        </Field>
        <Field label="Badge" htmlFor="te-short">
          <Input id="te-short" value={t.shortName} onChange={(e) => setT({ ...t, shortName: e.target.value })} maxLength={2} className="text-center" />
        </Field>
      </div>
      <Field label="Description" htmlFor="te-desc" className="mb-4">
        <Input id="te-desc" value={t.description} onChange={(e) => setT({ ...t, description: e.target.value })} maxLength={60} />
      </Field>
      <label className="mb-5 flex items-center gap-2.5 px-1 text-sm text-muted">
        <input type="checkbox" checked={t.isBonus} onChange={(e) => setT({ ...t, isBonus: e.target.checked })} className="h-4 w-4 accent-[var(--color-lime)]" />
        Bonus session (optional 4th workout)
      </label>

      <ul className="space-y-3">
        {t.exercises.map((e, i) => (
          <li key={e.id} className="rounded-2xl border border-line bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-2">
              <Input value={e.name} onChange={(ev) => update(i, { name: ev.target.value })} className="h-10 flex-1" aria-label="Exercise name" maxLength={50} />
              <Button variant="ghost" size="icon-sm" aria-label="Move up" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp size={15} />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Move down" onClick={() => move(i, 1)} disabled={i === t.exercises.length - 1}>
                <ArrowDown size={15} />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Remove exercise" onClick={() => setT((s) => ({ ...s, exercises: s.exercises.filter((_, j) => j !== i) }))}>
                <Trash2 size={15} />
              </Button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              <Field label="Sets">
                <Input type="number" inputMode="numeric" value={e.sets} onChange={(ev) => update(i, { sets: Number(ev.target.value) })} className="h-10 text-center" />
              </Field>
              <Field label={e.unit === "seconds" ? "Min sec" : "Min reps"}>
                <Input type="number" inputMode="numeric" value={e.repMin} onChange={(ev) => update(i, { repMin: Number(ev.target.value) })} className="h-10 text-center" />
              </Field>
              <Field label={e.unit === "seconds" ? "Max sec" : "Max reps"}>
                <Input type="number" inputMode="numeric" value={e.repMax} onChange={(ev) => update(i, { repMax: Number(ev.target.value) })} className="h-10 text-center" />
              </Field>
              <Field label="Rest (s)">
                <Input type="number" inputMode="numeric" value={e.restSec} onChange={(ev) => update(i, { restSec: Number(ev.target.value) })} className="h-10 text-center" />
              </Field>
            </div>
            <div className="mt-2 flex items-center gap-3">
              <Segmented<"reps" | "seconds">
                value={e.unit}
                onChange={(v) => update(i, { unit: v })}
                options={[
                  { value: "reps", label: "Reps" },
                  { value: "seconds", label: "Timed" },
                ]}
                size="sm"
                className="w-40"
              />
              <label className="flex items-center gap-2 text-xs text-muted">
                <input type="checkbox" checked={!!e.perSide} onChange={(ev) => update(i, { perSide: ev.target.checked })} className="accent-[var(--color-lime)]" /> Per side
              </label>
            </div>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        className="mt-3 w-full"
        onClick={() => setT((s) => ({ ...s, exercises: [...s.exercises, { id: uid(), name: "New exercise", sets: 3, repMin: 8, repMax: 12, unit: "reps", restSec: 90 }] }))}
      >
        <Plus size={16} /> Add exercise
      </Button>
      {error && <p className="mt-3 text-sm text-rose">{error}</p>}
    </Sheet>
  );
}

function ScheduleEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, profile } = useLoadedData();
  const [sched, setSched] = React.useState<ScheduleDay[]>(profile.schedule);
  React.useEffect(() => {
    if (open) setSched(profile.schedule);
  }, [open, profile.schedule]);
  const set = (i: number, patch: Partial<ScheduleDay>) => setSched((s) => s.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  const labelFor = (type: DayType, templateId?: string) => {
    if (type === "strength") return data.templates.find((t) => t.id === templateId)?.name ?? "Strength";
    if (type === "walk") return "Walk — 30 min";
    if (type === "optional") return "Optional walk or bonus";
    return "Recovery";
  };
  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Weekly plan"
      description="Missions and streaks follow this schedule"
      footer={
        <Button
          size="lg"
          className="w-full"
          onClick={async () => {
            await updateProfile({ schedule: sched });
            toast({ kind: "success", title: "Weekly plan saved" });
            onClose();
          }}
        >
          Save plan
        </Button>
      }
    >
      <ul className="space-y-2">
        {sched.map((d, i) => (
          <li key={i} className="rounded-2xl border border-line bg-surface-2 p-3">
            <p className="mb-2 text-sm font-semibold">{weekdayName(i)}</p>
            <Segmented<DayType>
              value={d.type}
              onChange={(type) => {
                const templateId = type === "strength" ? d.templateId ?? data.templates.find((t) => !t.isBonus)?.id : type === "optional" ? data.templates.find((t) => t.isBonus)?.id : undefined;
                set(i, { type, templateId, label: labelFor(type, templateId) });
              }}
              options={[
                { value: "strength", label: "Strength" },
                { value: "walk", label: "Walk" },
                { value: "optional", label: "Optional" },
                { value: "rest", label: "Rest" },
              ]}
              size="sm"
            />
            {d.type === "strength" && (
              <select
                value={d.templateId}
                onChange={(e) => set(i, { templateId: e.target.value, label: labelFor("strength", e.target.value) })}
                className="mt-2 h-10 w-full rounded-xl border border-line bg-surface-3 px-3 text-sm"
                aria-label={`${weekdayName(i)} workout`}
              >
                {data.templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

