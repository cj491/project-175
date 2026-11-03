"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { Check, ChevronLeft, ChevronRight, Clock, Minus, MoreHorizontal, Plus, Repeat, SkipForward, Timer, Trash2, Trophy, X, Zap, TrendingUp, Dumbbell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input } from "@/components/ui/form";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Chip, EmptyState } from "@/components/ui/misc";
import { useLoadedData } from "@/components/providers/data-provider";
import { discardSession, finishSession, updateSession } from "@/lib/db/repo";
import {
  compareOverload,
  exerciseHistory,
  formatPrescription,
  formatSet,
  nextTimeSuggestion,
  sessionDurationSec,
  sessionProgress,
  sessionVolume,
  summarizeExercise,
  type OverloadStatus,
} from "@/lib/domain/workout";
import { formatDuration, nowISO } from "@/lib/dates";
import type { SessionExercise, WorkoutSession } from "@/lib/types";
import { cn, fmt, normaliseKey, uid } from "@/lib/utils";
import { OverloadChip, usePrefill } from "./training-screen";
import { XP } from "@/lib/gamification/missions";
import { toast } from "@/lib/events";

function useNow(intervalMs = 1000) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SessionScreen() {
  const { data } = useLoadedData();
  const active = data.sessions.find((s) => s.status === "active");
  const [finishedId, setFinishedId] = React.useState<string | null>(null);

  if (finishedId) {
    const s = data.sessions.find((x) => x.id === finishedId);
    if (s) return <SessionSummary session={s} />;
  }
  if (!active) {
    return (
      <div className="grid min-h-dvh place-items-center p-6">
        <EmptyState
          icon={<Dumbbell size={22} />}
          title="No workout in progress"
          description="Start a workout from the Training tab."
          action={
            <Link href="/training" className="inline-flex h-11 items-center rounded-2xl bg-lime px-5 font-semibold text-lime-ink">
              Go to Training
            </Link>
          }
        />
      </div>
    );
  }
  return <ActiveSession key={active.id} initial={active} onFinished={setFinishedId} />;
}

function ActiveSession({ initial, onFinished }: { initial: WorkoutSession; onFinished: (id: string) => void }) {
  const router = useRouter();
  const { data } = useLoadedData();
  const prefill = usePrefill();
  // Local draft for snappy inputs; persisted to IndexedDB (debounced) so a refresh never loses sets.
  const [s, setS] = React.useState<WorkoutSession>(initial);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [replaceOpen, setReplaceOpen] = React.useState<"replace" | "add" | null>(null);
  const [finishOpen, setFinishOpen] = React.useState(false);
  const now = useNow();
  const history = React.useMemo(() => exerciseHistory(data.sessions), [data.sessions]);

  const pending = React.useRef<WorkoutSession | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = React.useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const p = pending.current;
    pending.current = null;
    if (p) await updateSession(p.id, { exercises: p.exercises, currentIndex: p.currentIndex, restEndsAt: p.restEndsAt ?? null, notes: p.notes });
  }, []);
  const commit = React.useCallback(
    (next: WorkoutSession) => {
      setS(next);
      pending.current = next;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 350);
    },
    [flush]
  );
  React.useEffect(() => () => void flush(), [flush]);

  const idx = Math.min(s.currentIndex, Math.max(0, s.exercises.length - 1));
  const ex = s.exercises[idx] as SessionExercise | undefined;
  const progress = sessionProgress(s);
  const elapsed = sessionDurationSec(s, now);
  const restLeft = s.restEndsAt ? Math.ceil((new Date(s.restEndsAt).getTime() - now) / 1000) : 0;
  const last = ex ? history.get(ex.exerciseKey)?.at(-1) : undefined;

  // Haptic + toast when rest ends.
  const restWasActive = React.useRef(false);
  React.useEffect(() => {
    if (restLeft > 0) restWasActive.current = true;
    else if (restWasActive.current && s.restEndsAt) {
      restWasActive.current = false;
      navigator.vibrate?.([120, 60, 120]);
      commit({ ...s, restEndsAt: null });
    }
  }, [restLeft, s, commit]);

  const updateEx = (i: number, patch: Partial<SessionExercise>) => commit({ ...s, exercises: s.exercises.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  const updateSet = (setIdx: number, patch: Partial<SessionExercise["sets"][number]>) => {
    if (!ex) return;
    updateEx(idx, { sets: ex.sets.map((x, j) => (j === setIdx ? { ...x, ...patch } : x)) });
  };

  const toggleSet = (setIdx: number) => {
    if (!ex) return;
    const set = ex.sets[setIdx];
    const nowDone = !set.done;
    // Default reps to the bottom of the range if left empty.
    const reps = set.reps ?? (nowDone ? ex.repMin : null);
    const sets = ex.sets.map((x, j) => (j === setIdx ? { ...x, done: nowDone, reps, completedAt: nowDone ? nowISO() : undefined } : x));
    const exercises = s.exercises.map((e, j) => (j === idx ? { ...e, sets } : e));
    const allDone = sets.every((x) => x.done);
    const restEndsAt = nowDone ? new Date(Date.now() + ex.restSec * 1000).toISOString() : s.restEndsAt;
    // Move on automatically after the last set of an exercise.
    const nextIdx = nowDone && allDone ? findNext(exercises, idx) : idx;
    commit({ ...s, exercises, restEndsAt, currentIndex: nextIdx });
    if (nowDone) navigator.vibrate?.(30);
  };

  const go = (i: number) => commit({ ...s, currentIndex: Math.max(0, Math.min(s.exercises.length - 1, i)) });

  const doFinish = async () => {
    await flush();
    // Switch to the summary first so there's no "no workout" flash in between.
    onFinished(s.id);
    await finishSession(s.id);
  };

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pb-40 pt-[max(1rem,env(safe-area-inset-top))] md:pt-8">
      {/* Top bar */}
      <div className="mb-4 flex items-center gap-3">
        <Button variant="secondary" size="icon" aria-label="Minimise workout" onClick={async () => (await flush(), router.push("/training"))}>
          <ChevronLeft size={20} />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{s.name}</p>
          <p className="num flex items-center gap-1.5 text-sm text-muted">
            <Clock size={13} /> {formatDuration(elapsed)} · {Math.round(progress.pct * 100)}% complete
          </p>
        </div>
        <Button variant="secondary" size="icon" aria-label="Workout options" onClick={() => setMenuOpen(true)}>
          <MoreHorizontal size={20} />
        </Button>
        <Button onClick={() => setFinishOpen(true)}>Finish</Button>
      </div>
      <ProgressBar value={progress.pct} height={6} className="mb-4" label="Workout completion" />

      {/* Exercise strip */}
      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {s.exercises.map((e, i) => {
          const d = e.sets.filter((x) => x.done).length;
          const complete = !e.skipped && d === e.sets.length && d > 0;
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => go(i)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors",
                i === idx ? "border-lime/60 bg-lime/10 text-lime" : "border-line bg-surface-2 text-muted",
                e.skipped && "line-through opacity-50"
              )}
            >
              {complete && <Check size={13} strokeWidth={3} className="text-lime" />}
              {e.name}
            </button>
          );
        })}
        <button type="button" onClick={() => setReplaceOpen("add")} className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-dashed border-line-strong px-3 text-[13px] text-muted">
          <Plus size={14} /> Add
        </button>
      </div>

      {!ex ? (
        <EmptyState
          icon={<Dumbbell size={22} />}
          title="No exercises yet"
          description="Add your first exercise to get going."
          action={<Button onClick={() => setReplaceOpen("add")}>Add exercise</Button>}
        />
      ) : (
        <AnimatePresence mode="wait">
          <motion.div key={ex.id} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
            <div className="rounded-3xl border border-line bg-surface p-5">
              <div className="mb-1 flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-subtle">
                    Exercise {idx + 1} of {s.exercises.length}
                  </p>
                  <h1 className="mt-1 text-2xl font-bold tracking-tight">{ex.name}</h1>
                  {ex.replacedFrom && <p className="text-xs text-subtle">Replacing {ex.replacedFrom}</p>}
                </div>
                <Chip tone="lime" className="mt-1 shrink-0 text-sm">
                  {formatPrescription({ sets: ex.targetSets, repMin: ex.repMin, repMax: ex.repMax, unit: ex.unit, perSide: ex.perSide })}
                </Chip>
              </div>
              {ex.notes && <p className="mt-2 text-sm text-muted">{ex.notes}</p>}
              {last ? (
                <div className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm">
                  <p className="num text-muted">
                    Last time: <span className="text-fg">{last.sets.map((x) => formatSet(last.unit, x.weight, x.reps)).join(" · ")}</span>
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-lime">
                    <TrendingUp size={13} /> {nextTimeSuggestion(last)}
                  </p>
                </div>
              ) : (
                <p className="mt-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-sm text-muted">First time logging this — pick a weight that leaves 1–3 good reps in reserve.</p>
              )}

              {ex.skipped ? (
                <div className="mt-5 flex items-center justify-between rounded-2xl border border-dashed border-line-strong p-4">
                  <p className="text-sm text-muted">Skipped</p>
                  <Button variant="secondary" size="sm" onClick={() => updateEx(idx, { skipped: false })}>
                    Undo skip
                  </Button>
                </div>
              ) : (
                <>
                  <div className="mt-5 grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                    <span>Set</span>
                    <span className="text-center">Weight (lb)</span>
                    <span className="text-center">{ex.unit === "seconds" ? "Seconds" : "Reps"}</span>
                    <span />
                  </div>
                  <ul className="mt-2 space-y-2">
                    {ex.sets.map((set, i) => {
                      const prev = last?.sets[i];
                      return (
                        <li key={set.id} className={cn("grid grid-cols-[2rem_1fr_1fr_3rem] items-center gap-2 rounded-2xl p-1 transition-colors", set.done && "bg-lime/5")}>
                          <span className={cn("num text-center text-sm font-bold", set.done ? "text-lime" : "text-muted")}>{i + 1}</span>
                          <NumberCell
                            value={set.weight}
                            placeholder={prev?.weight != null ? String(prev.weight) : "0"}
                            step={2.5}
                            onChange={(v) => updateSet(i, { weight: v })}
                            label={`Set ${i + 1} weight`}
                          />
                          <NumberCell
                            value={set.reps}
                            placeholder={prev?.reps != null ? String(prev.reps) : `${ex.repMin}`}
                            step={ex.unit === "seconds" ? 5 : 1}
                            onChange={(v) => updateSet(i, { reps: v })}
                            label={`Set ${i + 1} ${ex.unit === "seconds" ? "seconds" : "reps"}`}
                          />
                          <button
                            type="button"
                            onClick={() => toggleSet(i)}
                            aria-label={set.done ? `Mark set ${i + 1} not done` : `Complete set ${i + 1}`}
                            aria-pressed={set.done}
                            className={cn(
                              "grid h-12 w-12 place-items-center rounded-2xl border transition-all active:scale-90",
                              set.done ? "border-lime bg-lime text-lime-ink" : "border-line-strong bg-surface-3 text-subtle hover:text-fg"
                            )}
                          >
                            <Check size={22} strokeWidth={3} />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-3 flex gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const lastSet = ex.sets.at(-1);
                        updateEx(idx, { sets: [...ex.sets, { id: uid(), weight: lastSet?.weight ?? null, reps: null, done: false }] });
                      }}
                    >
                      <Plus size={15} /> Add set
                    </Button>
                    {ex.sets.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => updateEx(idx, { sets: ex.sets.slice(0, -1) })}>
                        <Minus size={15} /> Remove set
                      </Button>
                    )}
                  </div>
                </>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => setReplaceOpen("replace")}>
                <Repeat size={16} /> Replace
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  const exercises = s.exercises.map((e, j) => (j === idx ? { ...e, skipped: true } : e));
                  commit({ ...s, exercises, currentIndex: findNext(exercises, idx) });
                }}
                disabled={ex.skipped}
              >
                <SkipForward size={16} /> Skip
              </Button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}

      {/* Prev / next */}
      {ex && (
        <div className="mt-4 flex justify-between">
          <Button variant="ghost" onClick={() => go(idx - 1)} disabled={idx === 0}>
            <ChevronLeft size={18} /> Previous
          </Button>
          <Button variant="ghost" onClick={() => go(idx + 1)} disabled={idx >= s.exercises.length - 1}>
            Next <ChevronRight size={18} />
          </Button>
        </div>
      )}

      {/* Rest timer */}
      <AnimatePresence>
        {restLeft > 0 && (
          <motion.div
            initial={{ y: 120, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 120, opacity: 0 }}
            className="fixed inset-x-0 bottom-0 z-40 border-t border-line-strong bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur-xl md:left-auto md:right-6 md:bottom-6 md:w-96 md:rounded-3xl md:border"
            role="timer"
            aria-live="polite"
          >
            <div className="mx-auto flex max-w-2xl items-center gap-4">
              <ProgressRing value={restLeft / (ex?.restSec || 90)} size={56} stroke={5} color="var(--color-steps)" label="Rest remaining">
                <Timer size={18} className="text-steps" />
              </ProgressRing>
              <div className="flex-1">
                <p className="text-xs font-medium text-muted">Rest</p>
                <p className="num text-3xl font-bold">{formatDuration(restLeft)}</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => commit({ ...s, restEndsAt: new Date(new Date(s.restEndsAt!).getTime() - 15000).toISOString() })}>
                −15
              </Button>
              <Button variant="secondary" size="sm" onClick={() => commit({ ...s, restEndsAt: new Date(new Date(s.restEndsAt!).getTime() + 15000).toISOString() })}>
                +15
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Skip rest" onClick={() => commit({ ...s, restEndsAt: null })}>
                <X size={18} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ExercisePicker
        mode={replaceOpen}
        onClose={() => setReplaceOpen(null)}
        onPick={(name) => {
          const key = normaliseKey(name);
          const base: SessionExercise = {
            id: uid(),
            exerciseKey: key,
            name,
            unit: ex && replaceOpen === "replace" ? ex.unit : "reps",
            targetSets: ex?.targetSets ?? 3,
            repMin: ex?.repMin ?? 8,
            repMax: ex?.repMax ?? 12,
            restSec: ex?.restSec ?? 90,
            skipped: false,
            sets: Array.from({ length: ex?.targetSets ?? 3 }, () => ({ id: uid(), weight: null, reps: null, done: false })),
          };
          const filled = prefill(base);
          if (replaceOpen === "replace" && ex) {
            commit({ ...s, exercises: s.exercises.map((e, j) => (j === idx ? { ...filled, replacedFrom: ex.replacedFrom ?? ex.name } : e)) });
          } else {
            const exercises = [...s.exercises, filled];
            commit({ ...s, exercises, currentIndex: exercises.length - 1 });
          }
          setReplaceOpen(null);
        }}
      />

      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="Workout options">
        <div className="space-y-2">
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={async () => {
              if (!confirm("Discard this workout? Logged sets will be lost.")) return;
              if (timer.current) clearTimeout(timer.current);
              pending.current = null;
              await discardSession(s.id);
              toast({ kind: "info", title: "Workout discarded" });
              router.push("/training");
            }}
          >
            <Trash2 size={17} /> Discard workout
          </Button>
        </div>
      </Sheet>

      <Sheet open={finishOpen} onOpenChange={setFinishOpen} title="Finish workout?" description={`${progress.done} of ${progress.total} sets complete · ${formatDuration(elapsed)}`}>
        {progress.pct < 0.5 ? (
          <p className="mb-4 rounded-2xl bg-amber/10 px-4 py-3 text-sm text-amber">
            Less than half your sets are done. It&apos;ll be saved to your history, but it needs 50% of sets to count toward XP and streaks.
          </p>
        ) : progress.pct < 1 ? (
          <p className="mb-4 text-sm text-muted">Unfinished sets won&apos;t be recorded. That&apos;s fine — showing up is what counts.</p>
        ) : (
          <p className="mb-4 text-sm text-muted">Every set done. Outstanding.</p>
        )}
        <div className="flex gap-2">
          <Button variant="secondary" size="lg" className="flex-1" onClick={() => setFinishOpen(false)}>
            Keep going
          </Button>
          <Button size="lg" className="flex-1" onClick={doFinish}>
            <Check size={18} /> Finish
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function findNext(exercises: SessionExercise[], from: number) {
  for (let i = from + 1; i < exercises.length; i++) {
    const e = exercises[i];
    if (!e.skipped && e.sets.some((x) => !x.done)) return i;
  }
  for (let i = 0; i < from; i++) {
    const e = exercises[i];
    if (!e.skipped && e.sets.some((x) => !x.done)) return i;
  }
  return from;
}

function NumberCell({ value, onChange, placeholder, step, label }: { value: number | null; onChange: (v: number | null) => void; placeholder: string; step: number; label: string }) {
  const [text, setText] = React.useState(value === null ? "" : String(value));
  React.useEffect(() => {
    setText((t) => (Number(t) === value || (t === "" && value === null) ? t : value === null ? "" : String(value)));
  }, [value]);
  return (
    <div className="relative">
      <input
        aria-label={label}
        type="number"
        inputMode="decimal"
        step={step}
        min={0}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.value === "") return onChange(null);
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0 && n < 2000) onChange(n);
        }}
        className="num h-12 w-full rounded-2xl border border-line bg-surface-2 text-center text-lg font-semibold placeholder:text-subtle/60 focus:border-lime/60 focus:outline-none"
      />
    </div>
  );
}

function ExercisePicker({ mode, onClose, onPick }: { mode: "replace" | "add" | null; onClose: () => void; onPick: (name: string) => void }) {
  const { data } = useLoadedData();
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    if (mode) setQ("");
  }, [mode]);
  const names = React.useMemo(() => {
    const set = new Map<string, string>();
    data.templates.forEach((t) => t.exercises.forEach((e) => set.set(normaliseKey(e.name), e.name)));
    data.sessions.forEach((s) => s.exercises.forEach((e) => set.set(e.exerciseKey, e.name)));
    [
      "Dumbbell bench press",
      "Split squat",
      "Hip thrust",
      "Band pulldown",
      "Incline push-up",
      "Hamstring curl",
      "Leg press",
      "Seated cable row",
      "Step-up",
      "Suitcase carry",
      "Side plank",
      "Bird dog",
      "Sit-to-stand",
    ].forEach((n) => set.set(normaliseKey(n), n));
    return [...set.values()].sort();
  }, [data.templates, data.sessions]);
  const filtered = names.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 30);
  const exact = names.some((n) => n.toLowerCase() === q.trim().toLowerCase());
  return (
    <Sheet open={!!mode} onOpenChange={(o) => !o && onClose()} title={mode === "replace" ? "Replace exercise" : "Add exercise"} description="Pick from your exercises or type a new one">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (q.trim()) onPick(q.trim());
        }}
      >
        <Field label="Exercise" htmlFor="ex-pick">
          <Input id="ex-pick" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search or type a name" autoFocus maxLength={50} />
        </Field>
      </form>
      {q.trim() && !exact && (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => onPick(q.trim())}>
          <Plus size={16} /> Use “{q.trim()}”
        </Button>
      )}
      <ul className="mt-3 divide-y divide-line">
        {filtered.map((n) => (
          <li key={n}>
            <button type="button" onClick={() => onPick(n)} className="w-full py-3 text-left text-[15px] hover:text-lime">
              {n}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

function SessionSummary({ session }: { session: WorkoutSession }) {
  const { data } = useLoadedData();
  const history = React.useMemo(() => exerciseHistory(data.sessions), [data.sessions]);
  const progress = sessionProgress(session);
  const rows = session.exercises
    .map((e) => {
      const perf = summarizeExercise(session, e);
      if (!perf) return null;
      const list = history.get(e.exerciseKey) ?? [];
      const i = list.findIndex((p) => p.sessionId === session.id);
      const prev = i > 0 ? list[i - 1] : undefined;
      const status: OverloadStatus = compareOverload(perf, prev);
      const isPR = !!prev && list.slice(0, i).every((p) => perf.topWeight > p.topWeight || (perf.topWeight === p.topWeight && perf.topReps > p.topReps && perf.topWeight > 0));
      return { e, perf, status, isPR };
    })
    .filter(Boolean) as { e: SessionExercise; perf: NonNullable<ReturnType<typeof summarizeExercise>>; status: OverloadStatus; isPR: boolean }[];
  const counts = progress.pct >= 0.5;
  // XP is one-per-day; an earlier qualifying session today already claimed it.
  const alreadyEarned = data.sessions.some((o) => o.id !== session.id && o.date === session.date && o.status === "completed" && o.startedAt < session.startedAt && sessionProgress(o).pct >= 0.5);
  const prCount = rows.filter((r) => r.isPR).length;

  return (
    <div className="mx-auto min-h-dvh w-full max-w-xl px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))] md:pt-12">
      <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center">
        <div className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-[28px] bg-lime text-lime-ink shadow-[0_0_60px_-10px_var(--color-lime)]">
          <Check size={40} strokeWidth={3} />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">Workout complete</h1>
        <p className="mt-1 text-muted">{session.name} · that&apos;s discipline.</p>
        {counts && !alreadyEarned && (
          <p className="num mt-3 inline-flex items-center gap-1.5 rounded-full bg-xp/10 px-4 py-1.5 font-semibold text-xp">
            <Zap size={15} fill="currentColor" /> +{XP.workout} XP
          </p>
        )}
        {counts && alreadyEarned && <p className="mt-3 text-sm text-muted">Today&apos;s workout XP was already collected — this one still counts toward your history and records.</p>}
        {!counts && <p className="mt-3 text-sm text-muted">Saved to your history. Complete at least half your sets for it to count toward XP and streaks.</p>}
      </motion.div>

      <div className="mt-8 grid grid-cols-3 gap-2">
        {[
          ["Duration", formatDuration(sessionDurationSec(session))],
          ["Sets", `${progress.done}`],
          ["Volume", `${fmt(sessionVolume(session))} lb`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border border-line bg-surface p-3 text-center">
            <p className="text-xs text-muted">{l}</p>
            <p className="num mt-0.5 text-lg font-bold">{v}</p>
          </div>
        ))}
      </div>

      {prCount > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-2xl border border-xp/30 bg-xp/10 px-4 py-3">
          <Trophy size={20} className="text-xp" />
          <p className="font-semibold">
            {prCount} new personal record{prCount > 1 ? "s" : ""}!
          </p>
        </div>
      )}

      <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-[0.08em] text-subtle">Progressive overload</h2>
      <ul className="space-y-2">
        {rows.map(({ e, perf, status, isPR }) => (
          <li key={e.id} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold">{e.name}</p>
              <div className="flex gap-1.5">
                {isPR && (
                  <Chip tone="xp">
                    <Trophy size={12} /> PR
                  </Chip>
                )}
                <OverloadChip status={status} />
              </div>
            </div>
            <p className="num mt-1 text-sm text-muted">{perf.sets.map((x) => formatSet(perf.unit, x.weight, x.reps)).join(" · ")}</p>
            {nextTimeSuggestion(perf) && <p className="mt-1 text-xs text-lime">Next time: {nextTimeSuggestion(perf)}</p>}
          </li>
        ))}
        {rows.length === 0 && <p className="text-sm text-muted">No completed sets were recorded.</p>}
      </ul>

      <Link href="/" className="mt-8 flex h-14 items-center justify-center rounded-2xl bg-lime font-semibold text-lime-ink">
        Back to Home
      </Link>
      <Link href="/training" className="mt-2 flex h-12 items-center justify-center rounded-2xl text-muted hover:text-fg">
        View training history
      </Link>
    </div>
  );
}
