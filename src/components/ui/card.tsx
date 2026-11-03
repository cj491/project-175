import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0 rounded-3xl border border-line bg-surface p-5", className)} {...props} />;
}

export function CardHeader({
  title,
  subtitle,
  action,
  icon,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex items-start justify-between gap-3", className)}>
      <div className="flex min-w-0 items-center gap-2.5">
        {icon && <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-surface-3 text-muted">{icon}</div>}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-fg">{title}</h2>
          {subtitle && <p className="truncate text-[13px] text-muted">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 mt-1 flex items-center justify-between px-1">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.08em] text-subtle">{children}</h2>
      {action}
    </div>
  );
}
