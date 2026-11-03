"use client";

import * as React from "react";
import Link from "next/link";
import { UserRound } from "lucide-react";

export function PageHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <header className="mb-5 flex items-end justify-between gap-4 pt-2">
      <div className="min-w-0">
        {subtitle && <p className="mb-0.5 text-sm font-medium text-muted">{subtitle}</p>}
        <h1 className="truncate text-[28px] font-bold leading-tight tracking-tight md:text-[32px]">{title}</h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {action}
        <Link href="/profile" aria-label="Profile and settings" className="grid h-10 w-10 place-items-center rounded-full border border-line bg-surface-2 text-muted md:hidden">
          <UserRound size={19} />
        </Link>
      </div>
    </header>
  );
}

export function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-5xl px-4 pb-36 pt-[max(1rem,env(safe-area-inset-top))] md:px-8 md:pb-16 md:pt-8">{children}</div>;
}
