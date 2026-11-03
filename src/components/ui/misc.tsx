import * as React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-8 text-center", className)}>
      <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-surface-3 text-muted">{icon}</div>
      <p className="font-semibold text-fg">{title}</p>
      {description && <p className="mt-1 max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Chip({ children, tone = "default", className }: { children: React.ReactNode; tone?: "default" | "lime" | "emerald" | "amber" | "rose" | "xp"; className?: string }) {
  const tones = {
    default: "bg-surface-3 text-muted",
    lime: "bg-lime/12 text-lime",
    emerald: "bg-emerald/12 text-emerald",
    amber: "bg-amber/12 text-amber",
    rose: "bg-rose/12 text-rose",
    xp: "bg-xp/12 text-xp",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold", tones[tone], className)}>{children}</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-2xl", className)} />;
}

export function Stat({ label, value, unit, sub, className }: { label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="truncate text-xs font-medium text-muted">{label}</p>
      <p className="num mt-0.5 truncate text-xl font-semibold text-fg">
        {value}
        {unit && <span className="ml-0.5 text-sm font-medium text-subtle">{unit}</span>}
      </p>
      {sub && <p className="truncate text-xs text-subtle">{sub}</p>}
    </div>
  );
}

/** Small "Estimated" marker so estimates are never mistaken for measurements. */
export function EstimateTag({ className }: { className?: string }) {
  return (
    <span title="Estimated — not a measurement" className={cn("ml-1 rounded-md border border-line-strong px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-subtle", className)}>
      est.
    </span>
  );
}
