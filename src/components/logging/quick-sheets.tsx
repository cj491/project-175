"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Apple, Droplet, Dumbbell, Footprints, HeartPulse, Scale, Timer, Undo2 } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Textarea, UnitInput } from "@/components/ui/form";
import { useUI } from "@/components/providers/ui-provider";
import { useLoadedData } from "@/components/providers/data-provider";
import { addSteps, addWalk, addWater, saveCheckin, setSteps, setWeight, undoLastWater } from "@/lib/db/repo";
import { stepsSchema, validate, walkMinutesSchema, weightSchema, waterSchema } from "@/lib/validation";
import { toast } from "@/lib/events";
import { stepsOn, estimateDistanceMi, walkMinutesOn } from "@/lib/domain/activity";
import { waterOn } from "@/lib/domain/nutrition";
import { currentWeight } from "@/lib/domain/analytics";
import { cn, fmt } from "@/lib/utils";
import { formatRelativeDay } from "@/lib/dates";
import { EstimateTag } from "@/components/ui/misc";
import { ProgressBar } from "@/components/ui/progress";

function useSheetDate() {
  const { options } = useUI();
  const { today } = useLoadedData();
  return options.date ?? today;
}

export function QuickLogSheet() {
  const { sheet, openSheet, closeSheet } = useUI();
  const router = useRouter();
  const actions = [
    { label: "Food", icon: Apple, color: "text-protein", onClick: () => openSheet("food") },
    { label: "Water", icon: Droplet, color: "text-water", onClick: () => openSheet("water") },
    { label: "Workout", icon: Dumbbell, color: "text-lime", onClick: () => (closeSheet(), router.push("/training")) },
    { label: "Walk", icon: Timer, color: "text-steps", onClick: () => openSheet("walk") },
    { label: "Steps", icon: Footprints, color: "text-steps", onClick: () => openSheet("steps") },
    { label: "Weight", icon: Scale, color: "text-fg", onClick: () => openSheet("weight") },
    { label: "Check-in", icon: HeartPulse, color: "text-rose", onClick: () => openSheet("checkin") },
  ];
  return (
    <Sheet open={sheet === "quick"} onOpenChange={(o) => !o && closeSheet()} title="Quick log" description="What did you just do?">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
        {actions.map(({ label, icon: Icon, color, onClick }) => (
          <button
            key={label}
            type="button"
            onClick={onClick}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border border-line bg-surface-2 transition-all hover:bg-surface-3 active:scale-95"
          >
            <Icon size={26} className={color} />
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

export function WeightSheet() {
  const { sheet, closeSheet } = useUI();
  const { data } = useLoadedData();
  const date = useSheetDate();
  const existing = data.weights.find((w) => w.date === date);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const open = sheet === "weight";
  React.useEffect(() => {
    if (open) {
      setValue(String(existing?.weightLb ?? currentWeight(data)));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(weightSchema, value);
    if (!r.ok) return setError(r.error);
    await setWeight(date, r.data);
    toast({ kind: "success", title: `Weight saved: ${fmt(r.data, 1)} lb` });
    closeSheet();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeSheet()} title="Log weight" description={`${formatRelativeDay(date, date)} · best measured in the morning, after the washroom`}>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Body weight" error={error} htmlFor="weight-input">
          <UnitInput id="weight-input" unit="lb" step="0.1" value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="h-16 text-2xl font-semibold" />
        </Field>
        {existing && <p className="text-sm text-muted">This replaces today&apos;s entry of {existing.weightLb} lb.</p>}
        <Button type="submit" size="lg" className="w-full">
          Save weight
        </Button>
      </form>
    </Sheet>
  );
}

export function StepsSheet() {
  const { sheet, closeSheet } = useUI();
  const { data, targets } = useLoadedData();
  const date = useSheetDate();
  const current = stepsOn(data.steps, date);
  const [value, setValue] = React.useState("");
  const [mode, setMode] = React.useState<"set" | "add">("set");
  const [error, setError] = React.useState<string | null>(null);
  const open = sheet === "steps";
  React.useEffect(() => {
    if (open) {
      setValue(current ? String(current) : "");
      setMode("set");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(stepsSchema, value);
    if (!r.ok) return setError(r.error);
    if (mode === "set") await setSteps(date, r.data);
    else await addSteps(date, r.data);
    toast({ kind: "success", title: "Steps updated" });
    closeSheet();
  };
  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeSheet()} title="Log steps" description="Manual entry — copy the total from your phone or watch">
      <form onSubmit={submit} className="space-y-4">
        <div className="flex gap-2">
          {(["set", "add"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setValue(m === "set" && current ? String(current) : "");
              }}
              className={cn("h-9 flex-1 rounded-xl text-sm font-medium", mode === m ? "bg-surface-4 text-fg" : "bg-surface-2 text-muted")}
            >
              {m === "set" ? "Set today's total" : "Add steps"}
            </button>
          ))}
        </div>
        <Field label={mode === "set" ? "Total steps" : "Steps to add"} error={error} htmlFor="steps-input">
          <UnitInput id="steps-input" unit="steps" step="1" value={value} onChange={(e) => setValue(e.target.value)} autoFocus className="h-16 text-2xl font-semibold" />
        </Field>
        {mode === "add" && (
          <div className="flex gap-2">
            {[500, 1000, 2000].map((n) => (
              <Button key={n} variant="secondary" size="sm" className="flex-1" onClick={() => setValue(String((Number(value) || 0) + n))}>
                +{fmt(n)}
              </Button>
            ))}
          </div>
        )}
        <div className="rounded-2xl bg-surface-2 p-3">
          <div className="mb-2 flex justify-between text-sm">
            <span className="text-muted">Currently</span>
            <span className="num font-semibold">
              {fmt(current)} / {fmt(targets.steps)}
            </span>
          </div>
          <ProgressBar value={current / targets.steps} color="var(--color-steps)" />
        </div>
        <Button type="submit" size="lg" className="w-full">
          Save steps
        </Button>
      </form>
    </Sheet>
  );
}

export function WalkSheet() {
  const { sheet, closeSheet } = useUI();
  const { data, profile } = useLoadedData();
  const date = useSheetDate();
  const [custom, setCustom] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const open = sheet === "walk";
  React.useEffect(() => {
    if (open) {
      setCustom("");
      setError(null);
    }
  }, [open]);
  const log = async (minutes: number) => {
    await addWalk(date, minutes, profile.walkPaceMph);
    toast({ kind: "success", title: `${minutes}-minute walk logged`, detail: `≈ ${fmt(estimateDistanceMi(minutes, profile.walkPaceMph), 2)} mi (estimated)` });
    closeSheet();
  };
  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(walkMinutesSchema, custom);
    if (!r.ok) return setError(r.error);
    void log(Math.round(r.data));
  };
  const today = walkMinutesOn(data.walks, date);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeSheet()} title="Log a walk" description={`${today} min logged so far today`}>
      <div className="grid grid-cols-3 gap-2.5">
        {[10, 20, 30].map((m) => (
          <button key={m} type="button" onClick={() => log(m)} className="flex flex-col items-center rounded-2xl border border-line bg-surface-2 py-5 transition-all hover:bg-surface-3 active:scale-95">
            <span className="num text-3xl font-bold text-steps">{m}</span>
            <span className="text-xs text-muted">minutes</span>
          </button>
        ))}
      </div>
      <form onSubmit={submitCustom} className="mt-4 flex items-start gap-2">
        <Field label="Custom duration" error={error} className="flex-1" htmlFor="walk-custom">
          <UnitInput id="walk-custom" unit="min" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="45" />
        </Field>
        <Button type="submit" variant="secondary" className="mt-[26px] h-12">
          Log
        </Button>
      </form>
      <p className="mt-4 text-xs text-subtle">
        Distance is estimated from your pace setting ({profile.walkPaceMph} mph)
        <EstimateTag />
      </p>
    </Sheet>
  );
}

export function WaterSheet() {
  const { sheet, closeSheet } = useUI();
  const { data, targets } = useLoadedData();
  const date = useSheetDate();
  const total = waterOn(data.water, date);
  const [custom, setCustom] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const add = async (ml: number) => {
    await addWater(date, ml);
    toast({ kind: "success", title: `+${ml} ml water` });
  };
  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(waterSchema, custom);
    if (!r.ok) return setError(r.error);
    setError(null);
    setCustom("");
    void add(Math.round(r.data));
  };
  return (
    <Sheet open={sheet === "water"} onOpenChange={(o) => !o && closeSheet()} title="Water" description={`${fmt(total / 1000, 2)} of ${fmt(targets.waterMl / 1000, 1)} L today`}>
      <ProgressBar value={total / targets.waterMl} color="var(--color-water)" height={10} className="mb-5" label="Water progress" />
      <div className="grid grid-cols-3 gap-2.5">
        {[250, 500, 750].map((ml) => (
          <button key={ml} type="button" onClick={() => add(ml)} className="flex flex-col items-center rounded-2xl border border-line bg-surface-2 py-4 transition-all hover:bg-surface-3 active:scale-95">
            <Droplet size={20} className="mb-1 text-water" />
            <span className="num text-lg font-bold">{ml}</span>
            <span className="text-xs text-muted">ml</span>
          </button>
        ))}
      </div>
      <form onSubmit={submitCustom} className="mt-4 flex items-start gap-2">
        <Field label="Custom amount" error={error} className="flex-1" htmlFor="water-custom">
          <UnitInput id="water-custom" unit="ml" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="330" />
        </Field>
        <Button type="submit" variant="secondary" className="mt-[26px] h-12">
          Add
        </Button>
      </form>
      <div className="mt-4 flex justify-between">
        <Button variant="ghost" size="sm" onClick={() => undoLastWater(date)} disabled={total === 0}>
          <Undo2 size={16} /> Undo last
        </Button>
        <Button variant="secondary" size="sm" onClick={closeSheet}>
          Done
        </Button>
      </div>
    </Sheet>
  );
}

const SCALE_LABELS = ["Very low", "Low", "Okay", "Good", "Great"];

function ScalePicker({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <p className="mb-2 px-1 text-[13px] font-medium text-muted">{label}</p>
      <div className="grid grid-cols-5 gap-1.5" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            onClick={() => onChange(n)}
            className={cn(
              "flex flex-col items-center rounded-xl border py-2.5 transition-all",
              value === n ? "border-lime/50 bg-lime/10 text-lime" : "border-line bg-surface-2 text-muted hover:text-fg"
            )}
          >
            <span className="num text-lg font-bold">{n}</span>
            <span className="text-[10px]">{SCALE_LABELS[n - 1]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CheckinSheet() {
  const { sheet, closeSheet } = useUI();
  const { data } = useLoadedData();
  const date = useSheetDate();
  const existing = data.checkins.find((c) => c.date === date);
  const todayWeight = data.weights.find((w) => w.date === date);
  const [energy, setEnergy] = React.useState(3);
  const [mood, setMood] = React.useState(3);
  const [sleep, setSleep] = React.useState("");
  const [weight, setWeightVal] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const open = sheet === "checkin";
  React.useEffect(() => {
    if (open) {
      setEnergy(existing?.energy ?? 3);
      setMood(existing?.mood ?? 3);
      setSleep(existing?.sleepHours != null ? String(existing.sleepHours) : "");
      setNotes(existing?.notes ?? "");
      setWeightVal(todayWeight ? String(todayWeight.weightLb) : "");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (weight) {
      const r = validate(weightSchema, weight);
      if (!r.ok) return setError(r.error);
      await setWeight(date, r.data);
    }
    const sleepNum = sleep ? Number(sleep) : undefined;
    if (sleepNum !== undefined && (!Number.isFinite(sleepNum) || sleepNum < 0 || sleepNum > 16)) return setError("Sleep should be between 0 and 16 hours");
    await saveCheckin({ date, energy, mood, sleepHours: sleepNum, notes: notes.trim() || undefined });
    toast({ kind: "success", title: "Check-in saved" });
    closeSheet();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && closeSheet()} title="Daily check-in" description="Self-reported — how are you feeling today?">
      <form onSubmit={submit} className="space-y-5">
        <ScalePicker label="Energy" value={energy} onChange={setEnergy} />
        <ScalePicker label="Mood" value={mood} onChange={setMood} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Sleep last night" htmlFor="ci-sleep">
            <UnitInput id="ci-sleep" unit="hrs" step="0.5" value={sleep} onChange={(e) => setSleep(e.target.value)} placeholder="7.5" />
          </Field>
          <Field label="Weight (optional)" htmlFor="ci-weight">
            <UnitInput id="ci-weight" unit="lb" step="0.1" value={weight} onChange={(e) => setWeightVal(e.target.value)} placeholder="—" />
          </Field>
        </div>
        <Field label="Notes" htmlFor="ci-notes">
          <Textarea id="ci-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Energy, soreness, wins…" maxLength={280} />
        </Field>
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button type="submit" size="lg" className="w-full">
          {existing ? "Update check-in" : "Save check-in"}
        </Button>
      </form>
    </Sheet>
  );
}

