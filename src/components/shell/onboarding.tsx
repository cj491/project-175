"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, Dumbbell, Flame, Sparkles, Target, Trophy, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, UnitInput } from "@/components/ui/form";
import { STARTING_PROFILE, STARTING_TARGETS } from "@/lib/db/defaults";
import { completeOnboarding } from "@/lib/db/repo";
import { profileSchema, targetsSchema, validate } from "@/lib/validation";
import { todayISO, weekdayIndex, addDays } from "@/lib/dates";
import { EstimateTag } from "@/components/ui/misc";
import { Sheet } from "@/components/ui/sheet";
import { AuthForm } from "@/components/profile/account-card";
import { useSync } from "@/components/providers/sync-provider";

const STEPS = ["welcome", "about", "targets", "start"] as const;

function inchesToFtIn(inches: number) {
  return { ft: Math.floor(inches / 12), inch: Math.round(inches % 12) };
}

export function Onboarding() {
  const [step, setStep] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const h = inchesToFtIn(STARTING_PROFILE.heightIn);
  const [p, setP] = React.useState({
    name: "",
    age: String(STARTING_PROFILE.age),
    ft: String(h.ft),
    inch: String(h.inch),
    startWeightLb: String(STARTING_PROFILE.startWeightLb),
    goalWeightLb: String(STARTING_PROFILE.goalWeightLb),
    targetBodyFatPct: String(STARTING_PROFILE.targetBodyFatPct),
  });
  const [t, setT] = React.useState({
    calories: String(STARTING_TARGETS.calories),
    protein: String(STARTING_TARGETS.protein),
    carbs: String(STARTING_TARGETS.carbs),
    fat: String(STARTING_TARGETS.fat),
    waterMl: String(STARTING_TARGETS.waterMl),
    steps: String(STARTING_TARGETS.steps),
  });
  const today = todayISO();
  const nextMonday = addDays(today, (7 - weekdayIndex(today)) % 7 || 7);
  const [startChoice, setStartChoice] = React.useState<"today" | "monday">("today");
  const sync = useSync();
  const [authOpen, setAuthOpen] = React.useState(false);

  const setPF = (k: keyof typeof p) => (e: React.ChangeEvent<HTMLInputElement>) => setP((s) => ({ ...s, [k]: e.target.value }));
  const setTF = (k: keyof typeof t) => (e: React.ChangeEvent<HTMLInputElement>) => setT((s) => ({ ...s, [k]: e.target.value }));

  const profileValues = () => ({
    name: p.name,
    age: p.age,
    heightIn: Number(p.ft) * 12 + Number(p.inch || 0),
    startWeightLb: p.startWeightLb,
    goalWeightLb: p.goalWeightLb,
    targetBodyFatPct: p.targetBodyFatPct,
    timelineDays: STARTING_PROFILE.timelineDays,
    walkPaceMph: STARTING_PROFILE.walkPaceMph,
  });
  const targetValues = () => ({ ...t, walkMinutes: STARTING_TARGETS.walkMinutes, strengthPerWeek: STARTING_TARGETS.strengthPerWeek });

  const next = async () => {
    setError(null);
    if (STEPS[step] === "about") {
      const r = validate(profileSchema, profileValues());
      if (!r.ok) return setError(r.error);
      if (r.data.goalWeightLb >= r.data.startWeightLb) return setError("Goal weight should be below your starting weight");
    }
    if (STEPS[step] === "targets") {
      const r = validate(targetsSchema, targetValues());
      if (!r.ok) return setError(r.error);
    }
    if (STEPS[step] === "start") {
      const pr = validate(profileSchema, profileValues());
      const tr = validate(targetsSchema, targetValues());
      if (!pr.ok || !tr.ok) return setError("Please check your details");
      setBusy(true);
      try {
        await completeOnboarding({ profile: pr.data, targets: tr.data, startDate: startChoice === "today" ? today : nextMonday });
      } catch (e) {
        setError(`Couldn't save: ${String(e)}`);
        setBusy(false);
      }
      return;
    }
    setStep((s) => s + 1);
  };

  return (
    <div className="app-glow flex min-h-dvh flex-col items-center justify-center px-5 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-sm font-black text-lime-ink">175</div>
            <span className="font-bold tracking-tight">PROJECT 175</span>
          </div>
          <div className="flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
            {STEPS.map((s, i) => (
              <span key={s} className={`h-1.5 rounded-full transition-all ${i <= step ? "w-6 bg-lime" : "w-3 bg-surface-4"}`} />
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          <motion.div key={step} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25 }}>
            {STEPS[step] === "welcome" && (
              <div>
                <h1 className="text-4xl font-bold leading-[1.05] tracking-tight">
                  Six months.
                  <br />
                  <span className="text-lime">One version of you.</span>
                </h1>
                <p className="mt-4 text-[17px] leading-relaxed text-muted">
                  PROJECT 175 is your daily operating system: log food, train, walk, and watch your transformation happen — one day at a time.
                </p>
                <ul className="mt-8 space-y-3">
                  {[
                    { icon: Target, title: "Daily missions", desc: "A clear plan every morning, built from your schedule." },
                    { icon: Zap, title: "XP, levels & streaks", desc: "Every rep, meal and walk earns progress." },
                    { icon: Dumbbell, title: "Progressive overload", desc: "Know exactly when to add weight." },
                    { icon: Trophy, title: "Achievements", desc: "Milestones all the way to the 175 Club." },
                  ].map(({ icon: Icon, title, desc }) => (
                    <li key={title} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3.5">
                      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-lime/10 text-lime">
                        <Icon size={18} />
                      </div>
                      <div>
                        <p className="font-semibold">{title}</p>
                        <p className="text-sm text-muted">{desc}</p>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-6 text-xs text-subtle">
                  Your data stays on this device{sync.configured ? " unless you sign in for a private cloud backup" : ". Nothing is uploaded or shared"}.
                </p>
                {sync.configured && (
                  <button type="button" onClick={() => setAuthOpen(true)} className="mt-3 text-sm font-medium text-lime hover:underline">
                    {sync.userId ? "Signed in — restoring your data…" : "Already use PROJECT 175? Sign in to restore"}
                  </button>
                )}
              </div>
            )}

            {STEPS[step] === "about" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">About you</h2>
                  <p className="mt-1 text-muted">Prefilled from your plan — adjust anything.</p>
                </div>
                <Field label="First name (optional)" htmlFor="ob-name">
                  <Input id="ob-name" value={p.name} onChange={setPF("name")} placeholder="Your name" maxLength={40} />
                </Field>
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Age" htmlFor="ob-age">
                    <UnitInput id="ob-age" unit="yr" value={p.age} onChange={setPF("age")} />
                  </Field>
                  <Field label="Height" htmlFor="ob-ft">
                    <UnitInput id="ob-ft" unit="ft" value={p.ft} onChange={setPF("ft")} />
                  </Field>
                  <Field label="&nbsp;" htmlFor="ob-in">
                    <UnitInput id="ob-in" unit="in" value={p.inch} onChange={setPF("inch")} aria-label="Height inches" />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Starting weight" htmlFor="ob-sw">
                    <UnitInput id="ob-sw" unit="lb" step="0.1" value={p.startWeightLb} onChange={setPF("startWeightLb")} />
                  </Field>
                  <Field label="Goal weight" htmlFor="ob-gw">
                    <UnitInput id="ob-gw" unit="lb" step="0.1" value={p.goalWeightLb} onChange={setPF("goalWeightLb")} />
                  </Field>
                </div>
                <Field label="Target body fat" hint="A goal, not something the scale can confirm. Track waist, photos and strength alongside weight." htmlFor="ob-bf">
                  <UnitInput id="ob-bf" unit="%" value={p.targetBodyFatPct} onChange={setPF("targetBodyFatPct")} />
                </Field>
              </div>
            )}

            {STEPS[step] === "targets" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Daily targets</h2>
                  <p className="mt-1 text-muted">You can change these anytime without losing history.</p>
                </div>
                <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
                  <p className="flex items-center font-medium text-fg">
                    How 1,800 kcal was set <EstimateTag />
                  </p>
                  <p className="mt-1">
                    Estimated sedentary maintenance is ~2,260 kcal/day, so 1,800 creates a ~460 kcal daily gap before exercise. These are estimates, not a metabolic test — your
                    2–3 week weight trend is the real calibration.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Calories" htmlFor="ob-cal">
                    <UnitInput id="ob-cal" unit="kcal" value={t.calories} onChange={setTF("calories")} />
                  </Field>
                  <Field label="Protein" htmlFor="ob-p">
                    <UnitInput id="ob-p" unit="g" value={t.protein} onChange={setTF("protein")} />
                  </Field>
                  <Field label="Carbs" htmlFor="ob-c">
                    <UnitInput id="ob-c" unit="g" value={t.carbs} onChange={setTF("carbs")} />
                  </Field>
                  <Field label="Fat" htmlFor="ob-f">
                    <UnitInput id="ob-f" unit="g" value={t.fat} onChange={setTF("fat")} />
                  </Field>
                  <Field label="Water" htmlFor="ob-w">
                    <UnitInput id="ob-w" unit="ml" value={t.waterMl} onChange={setTF("waterMl")} />
                  </Field>
                  <Field label="Steps" htmlFor="ob-s">
                    <UnitInput id="ob-s" unit="steps" value={t.steps} onChange={setTF("steps")} />
                  </Field>
                </div>
              </div>
            )}

            {STEPS[step] === "start" && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">When does Day 1 start?</h2>
                  <p className="mt-1 text-muted">Your 6-month challenge counts from this date.</p>
                </div>
                {(
                  [
                    ["today", "Today", "Start building momentum right now."],
                    ["monday", "Next Monday", "Begin the week with Strength A."],
                  ] as const
                ).map(([k, title, desc]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setStartChoice(k)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-all ${startChoice === k ? "border-lime/60 bg-lime/5" : "border-line bg-surface hover:bg-surface-2"}`}
                  >
                    <div className={`grid h-10 w-10 place-items-center rounded-xl ${startChoice === k ? "bg-lime text-lime-ink" : "bg-surface-3 text-muted"}`}>
                      {k === "today" ? <Flame size={20} /> : <Sparkles size={20} />}
                    </div>
                    <div>
                      <p className="font-semibold">{title}</p>
                      <p className="text-sm text-muted">{desc}</p>
                    </div>
                  </button>
                ))}
                <div className="rounded-2xl border border-line bg-surface p-4 text-sm text-muted">
                  Weekly plan: <span className="text-fg">Mon</span> Strength A · <span className="text-fg">Tue</span> Walk · <span className="text-fg">Wed</span> Strength B ·{" "}
                  <span className="text-fg">Thu</span> Walk · <span className="text-fg">Fri</span> Strength C · <span className="text-fg">Sat</span> Optional · <span className="text-fg">Sun</span> Recovery
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {error && <p className="mt-4 text-sm text-rose" role="alert">{error}</p>}
        <Sheet open={authOpen && !sync.userId} onOpenChange={setAuthOpen} title="Sign in" description="Your plan, history and XP will be restored from your account">
          <AuthForm onDone={() => setAuthOpen(false)} />
        </Sheet>

        <div className="mt-8 flex gap-3">
          {step > 0 && (
            <Button variant="secondary" size="lg" onClick={() => setStep((s) => s - 1)} aria-label="Back">
              <ArrowLeft size={18} />
            </Button>
          )}
          <Button size="lg" className="flex-1" onClick={next} disabled={busy}>
            {STEPS[step] === "start" ? "Start PROJECT 175" : step === 0 ? "Let's build it" : "Continue"} <ArrowRight size={18} />
          </Button>
        </div>
      </div>
    </div>
  );
}
