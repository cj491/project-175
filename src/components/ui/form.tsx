"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-[15px] text-fg placeholder:text-subtle transition-colors",
      "focus:border-lime/60 focus:bg-surface-3 focus:outline-none",
      className
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "min-h-20 w-full rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[15px] text-fg placeholder:text-subtle",
      "focus:border-lime/60 focus:outline-none",
      className
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Field({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block px-1 text-[13px] font-medium text-muted">
        {label}
      </label>
      {children}
      {error ? <p className="px-1 text-xs text-rose">{error}</p> : hint ? <p className="px-1 text-xs text-subtle">{hint}</p> : null}
    </div>
  );
}

/** Input with a trailing unit (e.g. "lb", "g", "kcal"). */
export const UnitInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & { unit: string }>(
  ({ unit, className, ...props }, ref) => (
    <div className="relative">
      <Input ref={ref} inputMode="decimal" type="number" className={cn("pr-14 num", className)} {...props} />
      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-subtle">{unit}</span>
    </div>
  )
);
UnitInput.displayName = "UnitInput";

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "md",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode }[];
  className?: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 rounded-2xl border border-line bg-surface-2 p-1", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "flex-1 rounded-xl font-medium transition-all",
            size === "sm" ? "h-8 px-2 text-[13px]" : "h-10 px-3 text-sm",
            value === o.value ? "bg-surface-4 text-fg shadow-sm" : "text-muted hover:text-fg"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn("relative h-7 w-12 shrink-0 rounded-full transition-colors", checked ? "bg-lime" : "bg-surface-4")}
    >
      <span className={cn("absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform", checked ? "translate-x-[22px]" : "translate-x-0.5")} />
    </button>
  );
}
