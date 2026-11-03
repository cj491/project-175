"use client";

import * as React from "react";
import { Footprints, Pencil, Timer, Trash2 } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProgressRing } from "@/components/ui/progress";
import { Segmented, Field, UnitInput } from "@/components/ui/form";
import { EstimateTag, EmptyState } from "@/components/ui/misc";
import { BarSeriesChart, ChartEmpty } from "@/components/charts/chart-kit";
import { useLoadedData } from "@/components/providers/data-provider";
import { useUI } from "@/components/providers/ui-provider";
import { addWalk, deleteWalk, saveTargets } from "@/lib/db/repo";
import { dailySeries } from "@/lib/domain/analytics";
import { stepsOn, walkMinutesOn, walksOn } from "@/lib/domain/activity";
import { HealthDevicesCard } from "./health-devices";
import { ShortcutStepsCard } from "./shortcut-steps";
import { formatRelativeDay, formatTime, lastNDays } from "@/lib/dates";
import { stepsSchema, validate, walkMinutesSchema } from "@/lib/validation";
import { toast } from "@/lib/events";
import { avg, fmt, sum } from "@/lib/utils";

export function ActivityScreen() {
  const { data, today, profile, targets } = useLoadedData();
  const { openSheet } = useUI();
  const [range, setRange] = React.useState<"7" | "30">("7");
  const [custom, setCustom] = React.useState("");
  const [goalEdit, setGoalEdit] = React.useState(false);
  const [goal, setGoal] = React.useState(String(targets.steps));
  const [err, setErr] = React.useState<string | null>(null);

  const steps = stepsOn(data.steps, today);
  const src = data.steps.find((s) => s.date === today)?.source;
  const stepSource = src === "apple_health" ? "From Apple Health" : src === "health_connect" ? "From Health Connect" : "Manual entry";
  const walkMin = walkMinutesOn(data.walks, today);
  const todayWalks = walksOn(data.walks, today).sort((a, b) => b.loggedAt.localeCompare(a.loggedAt));
  const estMi = sum(todayWalks, (w) => w.estDistanceMi);
  const series = dailySeries(data, today, Number(range)).filter((d) => d.date >= profile.startDate);
  const hasSteps = series.some((d) => d.steps > 0);
  const hasWalks = series.some((d) => d.walkMin > 0);
  const avgSteps = avg(series.filter((d) => d.steps > 0).map((d) => d.steps));
  const weekWalk = sum(dailySeries(data, today, 7), (d) => d.walkMin);
  const walkDays = dailySeries(data, today, 7).filter((d) => d.walkMin >= 20).length;

  const logWalk = async (m: number) => {
    await addWalk(today, m, profile.walkPaceMph);
    toast({ kind: "success", title: `${m}-minute walk logged` });
  };

  return (
    <Page>
      <PageHeader title="Activity" subtitle="Move a little more every day" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader
            title="Steps today"
            subtitle={stepSource}
            action={
              <Button size="sm" onClick={() => openSheet("steps")}>
                <Pencil size={14} /> Log steps
              </Button>
            }
          />
          <div className="flex items-center gap-5">
            <ProgressRing value={steps / targets.steps} size={140} stroke={13} color="var(--color-steps)" label="Steps progress">
              <div className="text-center">
                <Footprints size={18} className="mx-auto mb-1 text-steps" />
                <p className="num text-xs text-muted">{Math.round((steps / targets.steps) * 100)}%</p>
              </div>
            </ProgressRing>
            <div>
              <p className="num text-4xl font-bold">{fmt(steps)}</p>
              {goalEdit ? (
                <form
                  className="mt-2 flex items-start gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const r = validate(stepsSchema, goal);
                    if (!r.ok || r.data < 1000) return setErr(r.ok ? "Step goal must be at least 1,000" : r.error);
                    await saveTargets({ steps: Math.round(r.data) });
                    setGoalEdit(false);
                    setErr(null);
                    toast({ kind: "success", title: "Step goal updated", detail: "Past days keep their old goal" });
                  }}
                >
                  <Field label="Daily goal" error={err} className="w-32" htmlFor="goal-input">
                    <UnitInput id="goal-input" unit="" value={goal} onChange={(e) => setGoal(e.target.value)} className="h-10" autoFocus />
                  </Field>
                  <Button type="submit" size="sm" className="mt-[26px]">
                    Save
                  </Button>
                </form>
              ) : (
                <button type="button" className="mt-1 text-sm text-muted hover:text-fg" onClick={() => (setGoal(String(targets.steps)), setGoalEdit(true))}>
                  Goal {fmt(targets.steps)} · <span className="underline decoration-subtle underline-offset-2">edit</span>
                </button>
              )}
              <p className="mt-2 text-sm text-muted">{steps >= targets.steps ? "Goal reached — nice work." : `${fmt(targets.steps - steps)} to go`}</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader title="Walking" subtitle={`${walkMin} min today · ${weekWalk} min this week · ${walkDays} walking day${walkDays === 1 ? "" : "s"}`} icon={<Timer size={16} />} />
          <div className="grid grid-cols-3 gap-2">
            {[10, 20, 30].map((m) => (
              <button key={m} type="button" onClick={() => logWalk(m)} className="rounded-2xl border border-line bg-surface-2 py-4 text-center transition-all hover:bg-surface-3 active:scale-95">
                <span className="num block text-2xl font-bold text-steps">+{m}</span>
                <span className="text-xs text-muted">minutes</span>
              </button>
            ))}
          </div>
          <form
            className="mt-3 flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const r = validate(walkMinutesSchema, custom);
              if (!r.ok) return setErr(r.error);
              setErr(null);
              setCustom("");
              void logWalk(Math.round(r.data));
            }}
          >
            <UnitInput unit="min" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Custom duration" aria-label="Custom walk minutes" className="h-11" />
            <Button type="submit" variant="secondary" className="h-11">
              Log
            </Button>
          </form>
          {todayWalks.length > 0 ? (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {todayWalks.map((w) => (
                <li key={w.id} className="flex items-center gap-3 py-2.5">
                  <Timer size={16} className="text-steps" />
                  <span className="flex-1 text-sm">
                    <span className="num font-semibold">{w.minutes} min</span> <span className="text-subtle">· {formatTime(w.loggedAt)}</span>
                  </span>
                  <span className="num flex items-center text-xs text-muted">
                    ≈ {fmt(w.estDistanceMi, 2)} mi <EstimateTag />
                  </span>
                  <Button variant="ghost" size="icon-sm" aria-label="Delete walk" onClick={() => deleteWalk(w.id)}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted">No walks yet today. Even 10 minutes after a meal counts.</p>
          )}
          {estMi > 0 && (
            <p className="mt-2 flex items-center text-xs text-subtle">
              Total today ≈ {fmt(estMi, 2)} mi at {profile.walkPaceMph} mph <EstimateTag />
            </p>
          )}
        </Card>

        <Card className="lg:col-span-12">
          <CardHeader
            title="Trends"
            subtitle={avgSteps ? `Averaging ${fmt(avgSteps)} steps on logged days` : "Log steps to see your trend"}
            action={
              <Segmented<"7" | "30">
                value={range}
                onChange={setRange}
                options={[
                  { value: "7", label: "7 days" },
                  { value: "30", label: "30 days" },
                ]}
                size="sm"
                className="w-40"
              />
            }
          />
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-medium">Daily steps</p>
              {hasSteps ? (
                <BarSeriesChart data={series} dataKey="steps" name="Steps" color="var(--color-steps)" xKey={range === "7" ? "short" : "label"} target={targets.steps} targetLabel="Goal" />
              ) : (
                <ChartEmpty>No step data in this range yet.</ChartEmpty>
              )}
            </div>
            <div>
              <p className="mb-2 text-sm font-medium">Walking minutes</p>
              {hasWalks ? (
                <BarSeriesChart data={series} dataKey="walkMin" name="Walking" unit="min" color="var(--color-lime)" xKey={range === "7" ? "short" : "label"} target={targets.walkMinutes} targetLabel={`${targets.walkMinutes} min`} />
              ) : (
                <ChartEmpty>No walks in this range yet.</ChartEmpty>
              )}
            </div>
          </div>
        </Card>

        <div className="lg:col-span-7">
          <SectionTitle>Daily history</SectionTitle>
          <Card className="p-0">
            {data.steps.length === 0 && data.walks.length === 0 ? (
              <EmptyState icon={<Footprints size={22} />} title="No activity logged yet" description="Log your steps or a walk and your history builds here." />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-subtle">
                    <th className="px-4 py-3 font-medium">Day</th>
                    <th className="px-2 py-3 text-right font-medium">Steps</th>
                    <th className="px-2 py-3 text-right font-medium">Walk</th>
                    <th className="px-4 py-3 text-right font-medium">Distance (est.)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {lastNDays(today, 14)
                    .filter((d) => d >= profile.startDate)
                    .reverse()
                    .map((d) => {
                      const st = stepsOn(data.steps, d);
                      const wm = walkMinutesOn(data.walks, d);
                      const mi = sum(walksOn(data.walks, d), (w) => w.estDistanceMi);
                      return (
                        <tr key={d}>
                          <td className="px-4 py-2.5 text-muted">{formatRelativeDay(d, today)}</td>
                          <td className="num px-2 py-2.5 text-right font-medium">
                            {st ? fmt(st) : "—"}
                            {st >= targets.steps && <span className="ml-1 text-steps">●</span>}
                          </td>
                          <td className="num px-2 py-2.5 text-right">{wm ? `${wm} min` : "—"}</td>
                          <td className="num px-4 py-2.5 text-right text-muted">{mi ? `${fmt(mi, 2)} mi` : "—"}</td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </Card>
        </div>

        <div className="lg:col-span-5">
          <SectionTitle>Connected devices</SectionTitle>
          <div className="space-y-3">
            <ShortcutStepsCard />
            <HealthDevicesCard />
          </div>
        </div>
      </div>
    </Page>
  );
}
