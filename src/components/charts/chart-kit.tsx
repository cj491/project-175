"use client";

import * as React from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipProps } from "recharts";
import { fmt } from "@/lib/utils";

/** Shared chart styling: recessive grid/axes, thin marks, dark tooltip. */
type Row = Record<string, unknown>;

export const AXIS = { stroke: "transparent", tick: { fill: "var(--color-subtle)", fontSize: 11 }, tickLine: false } as const;

function ChartTooltip({ active, payload, label, unit, digits = 0 }: TooltipProps<number, string> & { unit?: string; digits?: number; payload?: Array<{ name?: string; value?: number; color?: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-surface-2/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      <p className="mb-1 font-semibold text-fg">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="num flex items-center gap-2 text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          {p.name}: <span className="font-semibold text-fg">{p.value == null ? "—" : `${fmt(p.value, digits)}${unit ? ` ${unit}` : ""}`}</span>
        </p>
      ))}
    </div>
  );
}

export function BarSeriesChart({
  data,
  dataKey,
  name,
  color,
  xKey = "label",
  target,
  targetLabel,
  unit,
  height = 200,
  domainMax,
}: {
  data: Row[];
  dataKey: string;
  name: string;
  color: string;
  xKey?: string;
  target?: number;
  targetLabel?: string;
  unit?: string;
  height?: number;
  domainMax?: number;
}) {
  return (
    <div style={{ height }} role="img" aria-label={`${name} bar chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -18, bottom: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={8} />
          <YAxis {...AXIS} width={48} domain={[0, domainMax ?? "auto"]} tickFormatter={(v: number) => (v >= 1000 ? `${fmt(v / 1000, 1)}k` : String(v))} />
          <Tooltip cursor={{ fill: "rgb(255 255 255 / 0.04)" }} content={<ChartTooltip unit={unit} />} />
          {target ? <ReferenceLine y={target} stroke="var(--color-muted)" strokeDasharray="4 4" label={{ value: targetLabel ?? "Target", fill: "var(--color-muted)", fontSize: 10, position: "insideTopRight" }} /> : null}
          <Bar dataKey={dataKey} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LineSeriesChart({
  data,
  lines,
  xKey = "label",
  target,
  targetLabel,
  unit,
  height = 220,
  digits = 0,
  domain,
}: {
  data: Row[];
  lines: { key: string; name: string; color: string; dots?: boolean; dashed?: boolean }[];
  xKey?: string;
  target?: number;
  targetLabel?: string;
  unit?: string;
  height?: number;
  digits?: number;
  domain?: [number | "auto" | "dataMin" | "dataMax" | ((v: number) => number), number | "auto" | "dataMin" | "dataMax" | ((v: number) => number)];
}) {
  return (
    <div style={{ height }} role="img" aria-label={`${lines.map((l) => l.name).join(" and ")} line chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey={xKey} {...AXIS} interval="preserveStartEnd" minTickGap={16} />
          <YAxis {...AXIS} width={48} domain={domain ?? ["auto", "auto"]} tickFormatter={(v: number) => fmt(v, digits)} />
          <Tooltip cursor={{ stroke: "var(--color-line-strong)" }} content={<ChartTooltip unit={unit} digits={digits} />} />
          {target ? <ReferenceLine y={target} stroke="var(--color-lime)" strokeOpacity={0.5} strokeDasharray="4 4" label={{ value: targetLabel ?? "Goal", fill: "var(--color-muted)", fontSize: 10, position: "insideBottomRight" }} /> : null}
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={2}
              strokeDasharray={l.dashed ? "5 4" : undefined}
              dot={l.dots ? { r: 4, fill: l.color, stroke: "var(--color-surface)", strokeWidth: 2 } : false}
              activeDot={{ r: 5, stroke: "var(--color-surface)", strokeWidth: 2 }}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 px-1">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5 text-xs text-muted">
          <span className="h-0.5 w-4 rounded" style={{ background: i.dashed ? `repeating-linear-gradient(90deg, ${i.color} 0 4px, transparent 4px 7px)` : i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

export function ChartEmpty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-40 place-items-center rounded-2xl border border-dashed border-line-strong px-6 text-center text-sm text-subtle">{children}</div>;
}
