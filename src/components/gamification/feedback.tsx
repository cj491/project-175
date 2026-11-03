"use client";

import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, AlertTriangle, Zap } from "lucide-react";
import { onToast, type Toast } from "@/lib/events";
import { useAppData } from "@/components/providers/data-provider";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { ACHIEVEMENT_ICONS, TIER_STYLE } from "./icons";
import { markAchievementSeen, updateProfile } from "@/lib/db/repo";
import { levelFor } from "@/lib/gamification/levels";
import { sum } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function Toaster() {
  const [items, setItems] = React.useState<Toast[]>([]);
  React.useEffect(
    () =>
      onToast((t) => {
        setItems((prev) => [...prev.slice(-2), t]);
        setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== t.id)), t.kind === "xp" ? 2600 : 3200);
      }),
    []
  );
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[max(0.75rem,env(safe-area-inset-top))] z-[70] flex flex-col items-center gap-2 px-4" aria-live="polite">
      <AnimatePresence>
        {items.map((t) => (
          <motion.div
            key={t.id}
            layout
            initial={{ opacity: 0, y: -16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-line-strong bg-surface-2/95 py-2.5 pl-2.5 pr-4 shadow-2xl backdrop-blur-xl"
          >
            {t.kind === "xp" ? (
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-xp/15 text-xp">
                <Zap size={18} fill="currentColor" />
              </div>
            ) : t.kind === "success" ? (
              <CheckCircle2 className="ml-1 text-emerald" size={20} />
            ) : t.kind === "error" ? (
              <AlertTriangle className="ml-1 text-rose" size={20} />
            ) : (
              <Info className="ml-1 text-muted" size={20} />
            )}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">
                {t.kind === "xp" && <span className="num mr-1.5 text-xp">+{t.amount} XP</span>}
                {t.title}
              </p>
              {t.detail && <p className="text-xs text-muted">{t.detail}</p>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Burst({ color }: { color: string }) {
  const parts = React.useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const dist = 90 + ((i * 37) % 50);
        return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist, s: 4 + (i % 3) * 2, d: (i % 5) * 0.03 };
      }),
    []
  );
  return (
    <div className="pointer-events-none absolute left-1/2 top-1/2">
      {parts.map((p, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full"
          style={{ width: p.s, height: p.s, background: i % 3 === 0 ? "var(--color-lime)" : color }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
          animate={{ x: p.x, y: p.y, opacity: 0, scale: 1 }}
          transition={{ duration: 1.1, delay: 0.15 + p.d, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}

/**
 * Shows unlock celebrations for achievements not yet seen, then level-ups.
 * State lives in the database (achievement.seen / profile.lastLevelSeen),
 * so a celebration survives a refresh and never repeats.
 */
export function CelebrationLayer() {
  const { data } = useAppData();
  if (!data?.profile?.onboarded) return null;

  const unseen = data.achievements.filter((a) => !a.seen).sort((a, b) => a.unlockedAt.localeCompare(b.unlockedAt));
  const totalXp = sum(data.xp, (x) => x.amount);
  const lvl = levelFor(totalXp);
  const lastSeen = data.profile.lastLevelSeen ?? 1;

  let content: React.ReactNode = null;
  let key = "";
  let onClose = () => {};

  if (unseen.length) {
    const a = unseen[0];
    const def = ACHIEVEMENTS.find((d) => d.id === a.id);
    if (def) {
      const Icon = ACHIEVEMENT_ICONS[def.icon];
      const tier = TIER_STYLE[def.tier];
      key = `ach-${a.id}`;
      onClose = () => void markAchievementSeen(a.id);
      content = (
        <>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Achievement unlocked</p>
          <div className="relative my-6 grid place-items-center">
            <Burst color={tier.ring} />
            <motion.div
              initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 260, damping: 14 }}
              className={`grid h-28 w-28 place-items-center rounded-[32px] border-2 bg-gradient-to-b ${tier.bg}`}
              style={{ borderColor: tier.ring, boxShadow: `0 0 60px -10px ${tier.ring}` }}
            >
              <Icon size={48} className={tier.text} strokeWidth={1.75} />
            </motion.div>
          </div>
          <h2 className="text-2xl font-bold tracking-tight">{def.title}</h2>
          <p className="mt-1 text-muted">{def.description}</p>
          <p className={`mt-2 text-xs font-semibold uppercase tracking-widest ${tier.text}`}>{def.tier}</p>
        </>
      );
    } else {
      // Unknown id (e.g. from an older export) — just mark it seen.
      key = `ach-${a.id}`;
      onClose = () => void markAchievementSeen(a.id);
    }
  } else if (lvl.level > lastSeen) {
    key = `lvl-${lvl.level}`;
    onClose = () => void updateProfile({ lastLevelSeen: lvl.level });
    content = (
      <>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Level up</p>
        <div className="relative my-6 grid place-items-center">
          <Burst color="var(--color-xp)" />
          <motion.div
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 260, damping: 13 }}
            className="grid h-28 w-28 place-items-center rounded-full border-2 border-lime bg-lime/10 shadow-[0_0_80px_-10px_var(--color-lime)]"
          >
            <span className="num text-5xl font-bold text-lime">{lvl.level}</span>
          </motion.div>
        </div>
        <h2 className="text-2xl font-bold tracking-tight">{lvl.name}</h2>
        <p className="mt-1 text-muted">{lvl.next ? `${lvl.next.minXp - totalXp} XP to ${lvl.next.name}` : "Top level reached. Legendary."}</p>
      </>
    );
  }

  return (
    <AnimatePresence>
      {key && (
        <motion.div
          key={key}
          className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-6 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-modal="true"
          aria-label="Celebration"
        >
          <motion.div
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="w-full max-w-sm rounded-[32px] border border-line-strong bg-surface p-8 text-center shadow-2xl"
          >
            {content}
            <Button size="lg" className="mt-8 w-full" onClick={onClose} autoFocus>
              {content ? "Keep going" : "Continue"}
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
