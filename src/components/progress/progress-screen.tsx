"use client";

import * as React from "react";
import { Activity, CalendarCheck, Dumbbell, Ruler, Scale, Trash2, Zap, Beef, Flame, Footprints } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, UnitInput } from "@/components/ui/form";
import { EmptyState, EstimateTag, Chip } from "@/components/ui/misc";
import { BarSeriesChart, ChartEmpty, Legend, LineSeriesChart } from "@/components/charts/chart-kit";
import { PhotosPanel } from "./photos";
import { useLoadedData } from "@/components/providers/data-provider";
import { useUI } from "@/components/providers/ui-provider";
import { dailySeries, rollingAvgWeight, sortedWeights, weeklySummaries, weightSeries, transformation } from "@/lib/domain/analytics";
import { completedSessions, exerciseHistory } from "@/lib/domain/workout";
import { addDays, daysBetween, formatDate, startOfWeek } from "@/lib/dates";
import { deleteMeasurement, deleteWeight, saveMeasurement } from "@/lib/db/repo";
import { blankToUndef, measurementSchema, validate } from "@/lib/validation";
import { toast } from "@/lib/events";
import { avg, cn, fmt } from "@/lib/utils";

type Tab = "overview" | "body" | "photos" | "checkins";

export function ProgressScreen() {
  const [tab, setTab] = React.useState<Tab>("overview");
  return (
    <Page>
      <PageHeader title="Progress" subtitle="Watch the transformation happen" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "overview", label: "Charts" },
          { value: "body", label: "Body" },
          { value: "photos", label: "Photos" },
          { value: "checkins", label: "Check-ins" },
        ]}
        className="mb-5"
      />
      {tab === "overview" && <Overview />}
      {tab === "body" && <Body />}
      {tab === "photos" && <PhotosPanel />}
      {tab === "checkins" && <Checkins />}
    </Page>
  );
}

function Overview() {
  const { data, today, profile, targets } = useLoadedData();
  const [range, setRange] = React.useState<"14" | "30" | "90">("30");
  const n = Number(range);
  // Charts start at Day 1 — no empty bars for days before the challenge began.
  const series = dailySeries(data, today, n).filter((d) => d.date >= profile.startDate);
  const logged = series.filter((d) => d.logged);
  const ws = weightSeries(data).filter((w) => daysBetween(w.date, today) < n);
  const history = React.useMemo(() => exerciseHistory(data.sessions), [data.sessions]);
  const exerciseKeys = [...history.entries()].filter(([, p]) => p.length > 0).map(([k, p]) => ({ key: k, name: p.at(-1)!.name, count: p.length }));
  const [exKey, setExKey] = React.useState<string>("");
  const selectedKey = exKey || exerciseKeys.sort((a, b) => b.count - a.count)[0]?.key || "";
  const strength = (history.get(selectedKey) ?? []).map((p) => ({ label: formatDate(p.date), top: p.topWeight || null, e1rm: p.est1RM || null, reps: p.topReps }));
  const strengthUnit = history.get(selectedKey)?.[0]?.unit;

  // Weekly workouts since start
  const weeks: { label: string; workouts: number }[] = [];
  const startWk = startOfWeek(profile.startDate);
  const done = completedSessions(data.sessions);
  for (let w = startWk; w <= today; w = addDays(w, 7)) {
    weeks.push({ label: formatDate(w), workouts: done.filter((s) => s.date >= w && s.date <= addDays(w, 6)).length });
  }

  const avgCal = avg(logged.map((d) => d.calories));
  const avgProt = avg(logged.map((d) => d.protein));
  const stepDays = series.filter((d) => d.steps > 0);
  const avgSteps = avg(stepDays.map((d) => d.steps));
  const proteinHit = logged.filter((d) => d.protein >= d.proteinTarget).length;
  const tr = transformation(data, today)!;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">Averages use logged days only</p>
        <Segmented<"14" | "30" | "90">
          value={range}
          onChange={setRange}
          options={[
            { value: "14", label: "14d" },
            { value: "30", label: "30d" },
            { value: "90", label: "90d" },
          ]}
          size="sm"
          className="w-44"
        />
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Avg calories", value: avgCal ? fmt(avgCal) : "—", unit: "kcal", sub: `target ${fmt(targets.calories)}`, icon: Flame },
          { label: "Avg protein", value: avgProt ? fmt(avgProt) : "—", unit: "g", sub: logged.length ? `target hit ${proteinHit}/${logged.length} days` : "no logs yet", icon: Beef },
          { label: "Avg steps", value: avgSteps ? fmt(avgSteps) : "—", unit: "", sub: `${stepDays.length} days logged`, icon: Footprints },
          { label: "Workouts", value: String(done.filter((s) => daysBetween(s.date, today) < n).length), unit: "", sub: `in last ${n} days`, icon: Dumbbell },
        ].map((s) => (
          <Card key={s.label} className="p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted">
              <s.icon size={13} /> {s.label}
            </p>
            <p className="num mt-1 text-2xl font-bold">
              {s.value}
              <span className="ml-0.5 text-sm font-medium text-subtle">{s.unit}</span>
            </p>
            <p className="text-xs text-subtle">{s.sub}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Weight" subtitle={`${fmt(tr.lost, 1)} lb ${tr.lost >= 0 ? "down" : "up"} since start · 7-day average smooths daily noise`} icon={<Scale size={16} />} />
        {ws.length >= 2 ? (
          <>
            <LineSeriesChart
              data={ws}
              lines={[
                { key: "weight", name: "Weigh-in", color: "var(--color-muted)", dots: true },
                { key: "avg", name: "7-day avg", color: "var(--color-lime)" },
              ]}
              target={profile.goalWeightLb}
              targetLabel={`Goal ${profile.goalWeightLb}`}
              unit="lb"
              digits={1}
              domain={[(v: number) => Math.floor(Math.min(v, profile.goalWeightLb) - 2), (v: number) => Math.ceil(v + 2)]}
            />
            <Legend
              items={[
                { label: "Weigh-in", color: "var(--color-muted)" },
                { label: "7-day average", color: "var(--color-lime)" },
                { label: "Goal", color: "var(--color-lime)", dashed: true },
              ]}
            />
          </>
        ) : (
          <ChartEmpty>Log at least two weigh-ins to see your trend.</ChartEmpty>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Calories" subtitle="Daily intake vs. target" />
          {logged.length ? <BarSeriesChart data={series} dataKey="calories" name="Calories" unit="kcal" color="var(--color-lime)" target={targets.calories} /> : <ChartEmpty>No food logged in this range.</ChartEmpty>}
        </Card>
        <Card>
          <CardHeader title="Protein consistency" subtitle={logged.length ? `${proteinHit} of ${logged.length} logged days on target` : "Daily protein vs. target"} />
          {logged.length ? <BarSeriesChart data={series} dataKey="protein" name="Protein" unit="g" color="var(--color-protein)" target={targets.protein} /> : <ChartEmpty>No food logged in this range.</ChartEmpty>}
        </Card>
        <Card>
          <CardHeader title="Weekly workouts" subtitle={`Target ${targets.strengthPerWeek} per week`} />
          {done.length ? (
            <BarSeriesChart data={weeks} dataKey="workouts" name="Workouts" color="var(--color-lime)" target={targets.strengthPerWeek} domainMax={Math.max(4, ...weeks.map((w) => w.workouts))} />
          ) : (
            <ChartEmpty>Complete a workout to start this chart.</ChartEmpty>
          )}
        </Card>
        <Card>
          <CardHeader title="Steps" subtitle="Daily steps vs. goal" />
          {stepDays.length ? <BarSeriesChart data={series} dataKey="steps" name="Steps" color="var(--color-steps)" target={targets.steps} /> : <ChartEmpty>No steps logged in this range.</ChartEmpty>}
        </Card>
      </div>

      <Card>
        <CardHeader
          title="Strength progression"
          subtitle={strengthUnit === "seconds" ? "Best time per session" : "Top set weight and estimated 1-rep max"}
          icon={<Activity size={16} />}
          action={
            exerciseKeys.length ? (
              <select value={selectedKey} onChange={(e) => setExKey(e.target.value)} className="h-9 max-w-48 rounded-xl border border-line bg-surface-3 px-2 text-sm" aria-label="Exercise">
                {exerciseKeys.map((e) => (
                  <option key={e.key} value={e.key}>
                    {e.name}
                  </option>
                ))}
              </select>
            ) : undefined
          }
        />
        {strength.length >= 2 ? (
          strengthUnit === "seconds" ? (
            <LineSeriesChart data={strength} lines={[{ key: "reps", name: "Seconds", color: "var(--color-lime)", dots: true }]} unit="s" />
          ) : (
            <>
              <LineSeriesChart
                data={strength}
                lines={[
                  { key: "top", name: "Top set", color: "var(--color-lime)", dots: true },
                  { key: "e1rm", name: "Est. 1RM", color: "var(--color-carbs)", dashed: true },
                ]}
                unit="lb"
              />
              <Legend
                items={[
                  { label: "Top set weight", color: "var(--color-lime)" },
                  { label: "Estimated 1RM (Epley formula)", color: "var(--color-carbs)", dashed: true },
                ]}
              />
            </>
          )
        ) : (
          <ChartEmpty>{exerciseKeys.length ? "Log this exercise in two sessions to see a trend." : "Finish workouts to track strength over time."}</ChartEmpty>
        )}
      </Card>
    </div>
  );
}

function Body() {
  const { data, today, profile } = useLoadedData();
  const { openSheet } = useUI();
  const weights = sortedWeights(data).reverse();
  const measurements = [...data.measurements].sort((a, b) => b.date.localeCompare(a.date));
  const [form, setForm] = React.useState({ date: today, waistIn: "", chestIn: "", hipsIn: "", armIn: "", thighIn: "", bodyFatPctEstimate: "", notes: "" });
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const waistSeries = [...data.measurements].filter((m) => m.waistIn).sort((a, b) => a.date.localeCompare(b.date)).map((m) => ({ label: formatDate(m.date), waist: m.waistIn }));
  const avg7 = rollingAvgWeight(data, today);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const { date, ...rest } = form;
    const r = validate(measurementSchema, blankToUndef(rest));
    if (!r.ok) return setError(r.error);
    if (Object.values(r.data).every((v) => v === undefined)) return setError("Enter at least one measurement");
    await saveMeasurement({ date, ...r.data });
    setForm({ date: today, waistIn: "", chestIn: "", hipsIn: "", armIn: "", thighIn: "", bodyFatPctEstimate: "", notes: "" });
    setError(null);
    toast({ kind: "success", title: "Measurements saved" });
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader
          title="Weigh-ins"
          subtitle={avg7 ? `7-day average ${fmt(avg7, 1)} lb` : "Weigh under similar conditions each time"}
          icon={<Scale size={16} />}
          action={
            <Button size="sm" onClick={() => openSheet("weight")}>
              Log weight
            </Button>
          }
        />
        {weights.length === 0 ? (
          <EmptyState icon={<Scale size={22} />} title="No weigh-ins yet" />
        ) : (
          <ul className="max-h-96 divide-y divide-line overflow-y-auto">
            {weights.map((w, i) => {
              const prev = weights[i + 1];
              const diff = prev ? w.weightLb - prev.weightLb : null;
              return (
                <li key={w.date} className="flex items-center gap-3 py-2.5">
                  <span className="flex-1 text-sm text-muted">
                    {formatDate(w.date, { weekday: "short", month: "short", day: "numeric" })}
                    {w.date === profile.startDate && <Chip className="ml-2 py-0.5">Start</Chip>}
                  </span>
                  {diff !== null && <span className={cn("num text-xs", diff < 0 ? "text-emerald" : diff > 0 ? "text-subtle" : "text-subtle")}>{diff > 0 ? "+" : ""}{fmt(diff, 1)}</span>}
                  <span className="num w-20 text-right font-semibold">{fmt(w.weightLb, 1)} lb</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete weigh-in" onClick={() => deleteWeight(w.date)}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader title="Measurements" subtitle="Waist every 2–4 weeks tells you more than the scale" icon={<Ruler size={16} />} />
        <form onSubmit={submit} className="space-y-3">
          <Field label="Date" htmlFor="m-date">
            <Input id="m-date" type="date" value={form.date} max={today} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value || today }))} />
          </Field>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["waistIn", "Waist"],
                ["chestIn", "Chest"],
                ["hipsIn", "Hips"],
                ["armIn", "Arm"],
                ["thighIn", "Thigh"],
              ] as const
            ).map(([k, l]) => (
              <Field key={k} label={l} htmlFor={`m-${k}`}>
                <UnitInput id={`m-${k}`} unit="in" step="0.1" value={form[k]} onChange={set(k)} className="h-11 pr-9" />
              </Field>
            ))}
            <Field label={<span className="flex items-center">Body fat <EstimateTag /></span>} htmlFor="m-bf">
              <UnitInput id="m-bf" unit="%" step="0.1" value={form.bodyFatPctEstimate} onChange={set("bodyFatPctEstimate")} className="h-11 pr-9" />
            </Field>
          </div>
          <p className="text-xs text-subtle">Body fat is your own estimate (e.g. from a smart scale or calipers) — it&apos;s labeled as an estimate everywhere and never calculated by the app.</p>
          {error && <p className="text-sm text-rose">{error}</p>}
          <Button type="submit" className="w-full">
            Save measurements
          </Button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Waist trend" subtitle={waistSeries.length ? `${waistSeries.length} measurements` : undefined} />
        {waistSeries.length >= 2 ? <LineSeriesChart data={waistSeries} lines={[{ key: "waist", name: "Waist", color: "var(--color-lime)", dots: true }]} unit="in" digits={1} /> : <ChartEmpty>Log your waist twice to see a trend.</ChartEmpty>}
      </Card>

      <Card>
        <CardHeader title="Measurement history" />
        {measurements.length === 0 ? (
          <EmptyState icon={<Ruler size={22} />} title="No measurements yet" />
        ) : (
          <ul className="divide-y divide-line">
            {measurements.map((m) => (
              <li key={m.id} className="flex items-start gap-3 py-2.5">
                <div className="flex-1">
                  <p className="text-sm font-medium">{formatDate(m.date, { month: "short", day: "numeric", year: "numeric" })}</p>
                  <p className="num text-xs text-muted">
                    {[
                      m.waistIn && `Waist ${m.waistIn}"`,
                      m.chestIn && `Chest ${m.chestIn}"`,
                      m.hipsIn && `Hips ${m.hipsIn}"`,
                      m.armIn && `Arm ${m.armIn}"`,
                      m.thighIn && `Thigh ${m.thighIn}"`,
                      m.bodyFatPctEstimate && `BF ~${m.bodyFatPctEstimate}% (est.)`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </div>
                <Button variant="ghost" size="icon-sm" aria-label="Delete measurement" onClick={() => deleteMeasurement(m.id)}>
                  <Trash2 size={14} />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Checkins() {
  const { data, today } = useLoadedData();
  const weeks = React.useMemo(() => weeklySummaries(data, today), [data, today]);
  if (!weeks.length) return <EmptyState icon={<CalendarCheck size={22} />} title="No check-ins yet" />;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">A summary is generated every 7 days from your start date, using only what you logged.</p>
      {weeks.map((w) => (
        <Card key={w.week}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">Week {w.week}</h3>
              <p className="text-sm text-muted">
                {formatDate(w.from)} – {formatDate(w.to)}
              </p>
            </div>
            {w.complete ? <Chip tone="emerald">Complete</Chip> : <Chip tone="lime">In progress</Chip>}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Avg weight", w.avgWeight != null ? `${fmt(w.avgWeight, 1)} lb` : "—"],
              ["Change", w.weightChange != null ? `${w.weightChange > 0 ? "+" : ""}${fmt(w.weightChange, 1)} lb` : "—"],
              ["Avg calories", w.avgCalories != null ? fmt(w.avgCalories) : "—"],
              ["Avg protein", w.avgProtein != null ? `${w.avgProtein} g` : "—"],
              ["Workouts", String(w.workouts)],
              ["Avg steps", w.avgSteps != null ? fmt(w.avgSteps) : "—"],
              ["Missions", String(w.missionsCompleted)],
              ["XP earned", fmt(w.xpEarned)],
            ].map(([l, v]) => (
              <div key={l} className="rounded-2xl bg-surface-2 px-3 py-2.5">
                <p className="text-[11px] text-muted">{l}</p>
                <p className={cn("num font-semibold", l === "Change" && w.weightChange != null && w.weightChange < 0 && "text-emerald")}>{v}</p>
              </div>
            ))}
          </div>
          {w.observations.length > 0 && (
            <ul className="mt-4 space-y-2">
              {w.observations.map((o) => (
                <li key={o} className="flex gap-2 text-sm text-muted">
                  <Zap size={14} className="mt-0.5 shrink-0 text-lime" /> {o}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-subtle">Food logged on {w.daysLogged} of {w.daysElapsed} days · {w.walkMinutes} walking minutes</p>
        </Card>
      ))}
    </div>
  );
}
