"use client";

import * as React from "react";
import { cn, clamp } from "@/lib/utils";

/** Animated circular progress ring. */
export function ProgressRing({
  value,
  size = 160,
  stroke = 14,
  color = "var(--color-lime)",
  track = "var(--color-surface-3)",
  className,
  children,
  label,
}: {
  value: number; // 0..1 (values >1 show a full ring with an overflow tint)
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
  className?: string;
  children?: React.ReactNode;
  label?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = clamp(value, 0, 1);
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return (
    <div
      className={cn("relative inline-grid place-items-center", className)}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={mounted ? c * (1 - v) : c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.2, 0.8, 0.2, 1)", filter: v > 0 ? `drop-shadow(0 0 6px ${color}55)` : undefined }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Concentric rings, Apple-Fitness style. */
export function ActivityRings({
  rings,
  size = 132,
  stroke = 12,
  gap = 3,
}: {
  rings: { value: number; color: string; label: string }[];
  size?: number;
  stroke?: number;
  gap?: number;
}) {
  return (
    <div className="relative" style={{ width: size, height: size }}>
      {rings.map((ring, i) => {
        const s = size - i * 2 * (stroke + gap);
        return (
          <div key={ring.label} className="absolute" style={{ top: i * (stroke + gap), left: i * (stroke + gap) }}>
            <ProgressRing value={ring.value} size={s} stroke={stroke} color={ring.color} track={`color-mix(in srgb, ${ring.color} 14%, transparent)`} label={ring.label} />
          </div>
        );
      })}
    </div>
  );
}

export function ProgressBar({
  value,
  color = "var(--color-lime)",
  className,
  height = 8,
  label,
}: {
  value: number;
  color?: string;
  className?: string;
  height?: number;
  label?: string;
}) {
  const v = clamp(value, 0, 1);
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-surface-3", className)}
      style={{ height }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-out"
        style={{ width: `${v * 100}%`, background: color, boxShadow: v > 0 ? `0 0 12px ${color}55` : undefined }}
      />
    </div>
  );
}
