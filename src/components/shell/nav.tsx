"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Apple, Dumbbell, Footprints, LineChart, UserRound, Plus, Zap } from "lucide-react";
import { cn, sum } from "@/lib/utils";
import { useUI } from "@/components/providers/ui-provider";
import { useAppData } from "@/components/providers/data-provider";
import { levelFor } from "@/lib/gamification/levels";
import { ProgressBar } from "@/components/ui/progress";

export const NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/nutrition", label: "Nutrition", icon: Apple },
  { href: "/training", label: "Training", icon: Dumbbell },
  { href: "/activity", label: "Activity", icon: Footprints },
  { href: "/progress", label: "Progress", icon: LineChart },
  { href: "/profile", label: "Profile", icon: UserRound },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function MobileNav() {
  const pathname = usePathname();
  const { openSheet } = useUI();
  const items = NAV.filter((n) => n.href !== "/profile");
  if (pathname.startsWith("/training/session")) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => openSheet("quick")}
        aria-label="Quick log"
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-40 grid h-14 w-14 place-items-center rounded-2xl bg-lime text-lime-ink shadow-[0_10px_30px_-6px_rgb(212_255_58/0.55)] transition-transform active:scale-90 md:hidden"
      >
        <Plus size={26} strokeWidth={2.5} />
      </button>
      <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/85 backdrop-blur-xl md:hidden" aria-label="Primary">
        <ul className="mx-auto grid h-[4.5rem] max-w-lg grid-cols-5">
          {items.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn("flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors", active ? "text-lime" : "text-subtle hover:text-muted")}
                >
                  <Icon size={22} strokeWidth={active ? 2.4 : 1.9} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

export function DesktopNav() {
  const pathname = usePathname();
  const { openSheet } = useUI();
  const { data } = useAppData();
  const xp = data ? sum(data.xp, (x) => x.amount) : 0;
  const lvl = levelFor(xp);
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line px-4 py-6 md:flex lg:w-72">
      <Link href="/" className="mb-8 flex items-center gap-2.5 px-2">
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-lime text-sm font-black text-lime-ink">175</div>
        <div>
          <p className="text-[15px] font-bold tracking-tight">PROJECT 175</p>
          <p className="text-xs text-subtle">Personal fitness OS</p>
        </div>
      </Link>
      <nav aria-label="Primary" className="flex-1">
        <ul className="space-y-1">
          {NAV.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors",
                    active ? "bg-surface-3 text-fg" : "text-muted hover:bg-surface-2 hover:text-fg"
                  )}
                >
                  <Icon size={19} className={active ? "text-lime" : undefined} />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={() => openSheet("quick")}
          className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-lime font-semibold text-lime-ink transition-transform active:scale-[0.98]"
        >
          <Plus size={18} strokeWidth={2.5} /> Quick log
        </button>
      </nav>
      {data?.profile && (
        <Link href="/profile#achievements" className="rounded-2xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-muted">Level {lvl.level}</span>
            <span className="num flex items-center gap-1 text-xs font-semibold text-xp">
              <Zap size={12} fill="currentColor" /> {xp.toLocaleString()} XP
            </span>
          </div>
          <p className="mb-2.5 text-sm font-semibold">{lvl.name}</p>
          <ProgressBar value={lvl.progress} color="var(--color-xp)" height={6} label="Level progress" />
        </Link>
      )}
    </aside>
  );
}
