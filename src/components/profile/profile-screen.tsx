"use client";

import * as React from "react";
import { Bell, Download, Lock, Plus, Shield, Trash2, Upload, Zap, Database, History } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader, SectionTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Switch, UnitInput } from "@/components/ui/form";
import { ProgressBar } from "@/components/ui/progress";
import { Chip, EstimateTag } from "@/components/ui/misc";
import { useLoadedData } from "@/components/providers/data-provider";
import { ACHIEVEMENTS } from "@/lib/gamification/achievements";
import { ACHIEVEMENT_ICONS, TIER_STYLE } from "@/components/gamification/icons";
import { levelFor, LEVELS } from "@/lib/gamification/levels";
import { currentWeight } from "@/lib/domain/analytics";
import { exportAll, importAll, resetAll, saveTargets, updateProfile } from "@/lib/db/repo";
import { importSchema, profileSchema, targetsSchema, validate } from "@/lib/validation";
import { toast } from "@/lib/events";
import { formatDate } from "@/lib/dates";
import { cn, fmt, sum, uid } from "@/lib/utils";
import type { Reminder } from "@/lib/types";
import { AccountCard } from "./account-card";
import { disablePush, enablePush, PUSH_AVAILABLE, pushEnabledLocally } from "@/lib/sync/push";
import { getSupabase } from "@/lib/sync/supabase";
import { useSync } from "@/components/providers/sync-provider";

export function ProfileScreen() {
  React.useEffect(() => {
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ behavior: "smooth" });
  }, []);
  return (
    <Page>
      <PageHeader title="Profile" subtitle="Settings, goals & achievements" />
      <div className="space-y-6">
        <LevelCard />
        <Achievements />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProfileForm />
          <TargetsForm />
        </div>
        <AccountCard />
        <Reminders />
        <DataSection />
      </div>
    </Page>
  );
}

function LevelCard() {
  const { data } = useLoadedData();
  const xp = sum(data.xp, (x) => x.amount);
  const lvl = levelFor(xp);
  const recent = [...data.xp].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  return (
    <Card>
      <div className="flex flex-col gap-5 md:flex-row md:items-center">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-items-center rounded-[26px] border-2 border-lime/40 bg-lime/10 shadow-[0_0_40px_-12px_var(--color-lime)]">
            <span className="num text-4xl font-bold text-lime">{lvl.level}</span>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-subtle">Level {lvl.level}</p>
            <p className="text-2xl font-bold tracking-tight">{lvl.name}</p>
            <p className="num flex items-center gap-1 text-sm text-xp">
              <Zap size={14} fill="currentColor" /> {fmt(xp)} XP total
            </p>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="num mb-1.5 flex justify-between gap-2 text-xs text-muted">
            <span>{fmt(lvl.xpIntoLevel)} XP</span>
            <span>{lvl.next ? `${fmt(lvl.next.minXp - xp)} to ${lvl.next.name}` : "Max level"}</span>
          </div>
          <ProgressBar value={lvl.progress} color="var(--color-xp)" height={10} label="Level progress" />
          <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto">
            {LEVELS.map((l) => (
              <span key={l.level} title={`${l.name} · ${fmt(l.minXp)} XP`} className={cn("num grid h-7 min-w-7 shrink-0 place-items-center rounded-lg px-1.5 text-xs font-bold", l.level <= lvl.level ? "bg-lime text-lime-ink" : "bg-surface-3 text-subtle")}>
                {l.level}
              </span>
            ))}
          </div>
        </div>
      </div>
      {recent.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted">
            <History size={13} /> Recent XP
          </p>
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {recent.map((x) => (
              <li key={x.id} className="flex justify-between text-sm">
                <span className="truncate text-muted">{x.label}</span>
                <span className="num shrink-0 font-semibold text-xp">+{x.amount}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Achievements() {
  const { data, today } = useLoadedData();
  const unlocked = new Map(data.achievements.map((a) => [a.id, a]));
  const ctx = { today, totalXp: sum(data.xp, (x) => x.amount), currentWeight: currentWeight(data) };
  return (
    <section id="achievements">
      <SectionTitle action={<span className="num text-xs text-muted">{unlocked.size} / {ACHIEVEMENTS.length}</span>}>Achievements</SectionTitle>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ACHIEVEMENTS.map((a) => {
          const u = unlocked.get(a.id);
          const p = a.progress(data, ctx);
          const Icon = ACHIEVEMENT_ICONS[a.icon];
          const tier = TIER_STYLE[a.tier];
          return (
            <div key={a.id} className={cn("relative rounded-3xl border p-4 transition-colors", u ? "border-line-strong bg-surface" : "border-line bg-surface/50")}>
              <div
                className={cn("mb-3 grid h-12 w-12 place-items-center rounded-2xl border", u ? `bg-gradient-to-b ${tier.bg}` : "border-line bg-surface-3")}
                style={u ? { borderColor: tier.ring } : undefined}
              >
                {u ? <Icon size={22} className={tier.text} /> : <Lock size={18} className="text-subtle" />}
              </div>
              <p className={cn("font-semibold leading-tight", !u && "text-muted")}>{a.title}</p>
              <p className="mt-0.5 text-xs text-subtle">{a.description}</p>
              {u ? (
                <p className="mt-2 text-[11px] font-medium text-muted">Unlocked {formatDate(u.unlockedAt.slice(0, 10))}</p>
              ) : (
                <div className="mt-2.5">
                  <ProgressBar value={p.value / p.target} height={4} color="var(--color-muted)" />
                  <p className="num mt-1 text-[11px] text-subtle">
                    {fmt(p.value, 1)} / {fmt(p.target, 1)}
                  </p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProfileForm() {
  const { profile } = useLoadedData();
  const [f, setF] = React.useState({
    name: profile.name,
    age: String(profile.age),
    heightIn: String(profile.heightIn),
    startWeightLb: String(profile.startWeightLb),
    goalWeightLb: String(profile.goalWeightLb),
    targetBodyFatPct: String(profile.targetBodyFatPct),
    timelineDays: String(profile.timelineDays),
    walkPaceMph: String(profile.walkPaceMph),
  });
  const [startDate, setStartDate] = React.useState(profile.startDate);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(profileSchema, f);
    if (!r.ok) return setError(r.error);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return setError("Start date is required");
    setError(null);
    await updateProfile({ ...r.data, startDate });
    toast({ kind: "success", title: "Profile saved" });
  };
  return (
    <Card>
      <CardHeader title="Profile" subtitle={`${profile.sex === "male" ? "Male" : "Female"} · ${profile.lifestyle}`} />
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name" htmlFor="pf-name">
          <Input id="pf-name" value={f.name} onChange={set("name")} maxLength={40} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Age" htmlFor="pf-age">
            <UnitInput id="pf-age" unit="yr" value={f.age} onChange={set("age")} />
          </Field>
          <Field label="Height" hint={`${Math.floor(Number(f.heightIn) / 12)}′${Math.round(Number(f.heightIn) % 12)}″`} htmlFor="pf-h">
            <UnitInput id="pf-h" unit="in" value={f.heightIn} onChange={set("heightIn")} />
          </Field>
          <Field label="Starting weight" htmlFor="pf-sw">
            <UnitInput id="pf-sw" unit="lb" step="0.1" value={f.startWeightLb} onChange={set("startWeightLb")} />
          </Field>
          <Field label="Goal weight" htmlFor="pf-gw">
            <UnitInput id="pf-gw" unit="lb" step="0.1" value={f.goalWeightLb} onChange={set("goalWeightLb")} />
          </Field>
          <Field label="Target body fat" htmlFor="pf-bf">
            <UnitInput id="pf-bf" unit="%" value={f.targetBodyFatPct} onChange={set("targetBodyFatPct")} />
          </Field>
          <Field label="Timeline" htmlFor="pf-tl">
            <UnitInput id="pf-tl" unit="days" value={f.timelineDays} onChange={set("timelineDays")} />
          </Field>
          <Field label="Start date" htmlFor="pf-sd">
            <Input id="pf-sd" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label={<span className="flex items-center">Walking pace <EstimateTag /></span>} hint="Used to estimate distance" htmlFor="pf-pace">
            <UnitInput id="pf-pace" unit="mph" step="0.1" value={f.walkPaceMph} onChange={set("walkPaceMph")} />
          </Field>
        </div>
        <p className="text-xs text-subtle">Equipment: {profile.equipment}</p>
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button type="submit" className="w-full">
          Save profile
        </Button>
      </form>
    </Card>
  );
}

function TargetsForm() {
  const { data, targets, today } = useLoadedData();
  const [f, setF] = React.useState({
    calories: String(targets.calories),
    protein: String(targets.protein),
    carbs: String(targets.carbs),
    fat: String(targets.fat),
    waterMl: String(targets.waterMl),
    steps: String(targets.steps),
    walkMinutes: String(targets.walkMinutes),
    strengthPerWeek: String(targets.strengthPerWeek),
  });
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const implied = Number(f.protein) * 4 + Number(f.carbs) * 4 + Number(f.fat) * 9;
  const versions = [...data.targets].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(targetsSchema, f);
    if (!r.ok) return setError(r.error);
    setError(null);
    await saveTargets(r.data, today);
    toast({ kind: "success", title: "Targets updated", detail: "Effective today — past days keep their old targets" });
  };
  return (
    <Card>
      <CardHeader title="Daily targets" subtitle="Changes apply from today; history is preserved" />
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label={<span className="flex items-center">Calories <EstimateTag /></span>} hint={`Macros add up to ${fmt(implied)} kcal`} htmlFor="tg-cal">
            <UnitInput id="tg-cal" unit="kcal" value={f.calories} onChange={set("calories")} />
          </Field>
          <Field label="Protein" htmlFor="tg-p">
            <UnitInput id="tg-p" unit="g" value={f.protein} onChange={set("protein")} />
          </Field>
          <Field label="Carbs" htmlFor="tg-c">
            <UnitInput id="tg-c" unit="g" value={f.carbs} onChange={set("carbs")} />
          </Field>
          <Field label="Fat" htmlFor="tg-f">
            <UnitInput id="tg-f" unit="g" value={f.fat} onChange={set("fat")} />
          </Field>
          <Field label="Water" htmlFor="tg-w">
            <UnitInput id="tg-w" unit="ml" value={f.waterMl} onChange={set("waterMl")} />
          </Field>
          <Field label="Step goal" htmlFor="tg-s">
            <UnitInput id="tg-s" unit="steps" value={f.steps} onChange={set("steps")} />
          </Field>
          <Field label="Walk goal" htmlFor="tg-wm">
            <UnitInput id="tg-wm" unit="min" value={f.walkMinutes} onChange={set("walkMinutes")} />
          </Field>
          <Field label="Strength / week" htmlFor="tg-spw">
            <UnitInput id="tg-spw" unit="×" value={f.strengthPerWeek} onChange={set("strengthPerWeek")} />
          </Field>
        </div>
        {error && <p className="text-sm text-rose">{error}</p>}
        <Button type="submit" className="w-full">
          Save targets
        </Button>
      </form>
      {versions.length > 1 && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-xs font-medium text-muted">Target history</p>
          <ul className="space-y-1">
            {versions.map((v) => (
              <li key={v.id} className="num flex justify-between text-xs text-subtle">
                <span>From {formatDate(v.effectiveFrom, { month: "short", day: "numeric", year: "numeric" })}</span>
                <span>
                  {fmt(v.calories)} kcal · {v.protein}P/{v.carbs}C/{v.fat}F · {fmt(v.steps)} steps
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Reminders() {
  const { profile } = useLoadedData();
  const sync = useSync();
  const [push, setPush] = React.useState(() => pushEnabledLocally());
  const [pushBusy, setPushBusy] = React.useState(false);
  const togglePush = async (on: boolean) => {
    setPushBusy(true);
    try {
      if (on) {
        const supabase = getSupabase();
        const err = supabase ? await enablePush(supabase) : "Sign in to enable background reminders";
        if (err) return toast({ kind: "error", title: "Couldn't enable background reminders", detail: err });
        await updateProfile({ notificationsEnabled: true });
        setPush(true);
        toast({ kind: "success", title: "Background reminders on", detail: "You'll get them even when the app is closed" });
      } else {
        await disablePush(getSupabase());
        setPush(false);
      }
    } finally {
      setPushBusy(false);
    }
  };
  const [perm, setPerm] = React.useState<string>(() => (typeof Notification !== "undefined" ? Notification.permission : "unsupported"));
  const update = (list: Reminder[]) => updateProfile({ reminders: list });
  const patch = (id: string, p: Partial<Reminder>) => update(profile.reminders.map((r) => (r.id === id ? { ...r, ...p } : r)));

  const enableNotifications = async (on: boolean) => {
    if (on && typeof Notification !== "undefined" && Notification.permission !== "granted") {
      const res = await Notification.requestPermission();
      setPerm(res);
      if (res !== "granted") {
        toast({ kind: "info", title: "Notifications blocked", detail: "You'll still see reminders inside the app." });
        return updateProfile({ notificationsEnabled: false });
      }
    }
    await updateProfile({ notificationsEnabled: on });
  };

  return (
    <Card>
      <CardHeader title="Reminders" subtitle="Gentle, relevant, at most once a day each — skipped if you've already done it" icon={<Bell size={16} />} />
      <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
        <div>
          <p className="text-sm font-medium">System notifications</p>
          <p className="text-xs text-subtle">
            {perm === "unsupported" ? "Not supported in this browser" : perm === "denied" ? "Blocked in browser settings" : "Shown while the app is open or installed"}
          </p>
        </div>
        <Switch checked={profile.notificationsEnabled && perm === "granted"} onChange={enableNotifications} label="System notifications" />
      </div>
      {sync.configured && PUSH_AVAILABLE && (
        <div className="mb-4 flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
          <div>
            <p className="text-sm font-medium">Background reminders</p>
            <p className="text-xs text-subtle">{sync.userId ? "Delivered even when the app is closed" : "Sign in to cloud sync to enable"}</p>
          </div>
          <Switch checked={push && !!sync.userId} onChange={(v) => !pushBusy && sync.userId && togglePush(v)} label="Background reminders" />
        </div>
      )}
      <ul className="space-y-2">
        {profile.reminders.map((r) => (
          <li key={r.id} className="flex items-center gap-3 rounded-2xl border border-line px-3 py-2.5">
            <Switch checked={r.enabled} onChange={(v) => patch(r.id, { enabled: v })} label={`Toggle ${r.label}`} />
            <Input value={r.label} onChange={(e) => patch(r.id, { label: e.target.value })} className="h-9 flex-1 border-transparent bg-transparent px-1" aria-label="Reminder label" maxLength={60} />
            <input type="time" value={r.time} onChange={(e) => patch(r.id, { time: e.target.value || r.time })} className="num h-9 rounded-xl bg-surface-3 px-2 text-sm" aria-label="Reminder time" />
            {r.kind === "custom" && (
              <Button variant="ghost" size="icon-sm" aria-label="Delete reminder" onClick={() => update(profile.reminders.filter((x) => x.id !== r.id))}>
                <Trash2 size={14} />
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" size="sm" className="mt-3" onClick={() => update([...profile.reminders, { id: uid(), label: "Custom reminder", time: "12:00", enabled: true, kind: "custom" }])}>
        <Plus size={15} /> Add reminder
      </Button>
      <p className="mt-3 text-xs text-subtle">Reminders like protein and water only fire if you haven&apos;t hit the target yet. {sync.configured && PUSH_AVAILABLE ? "Times use this device's time zone." : "Background reminders (app closed) need cloud sync to be set up."}</p>
    </Card>
  );
}

function DataSection() {
  const sync = useSync();
  const fileRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const doExport = async (photos: boolean) => {
    setBusy(true);
    try {
      const payload = await exportAll(photos);
      const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `project-175-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const json = JSON.parse(await file.text());
      const r = validate(importSchema, json);
      if (!r.ok) return toast({ kind: "error", title: "Not a PROJECT 175 backup" });
      if (!confirm("Importing replaces all data on this device with the backup. Continue?")) return;
      setBusy(true);
      await importAll(r.data);
      toast({ kind: "success", title: "Backup restored" });
    } catch (err) {
      toast({ kind: "error", title: "Import failed", detail: String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader title="Your data" subtitle="Stored privately in this browser" icon={<Database size={16} />} />
      <div className="mb-4 flex items-start gap-3 rounded-2xl bg-surface-2 p-4 text-sm text-muted">
        <Shield size={18} className="mt-0.5 shrink-0 text-emerald" />
        <p>
          Everything — meals, workouts, weight and photos — lives in this browser&apos;s local database, with an optional private cloud copy when you sign in. There are no
          analytics and no third-party tracking. If you aren&apos;t signed in, clearing browser data deletes everything, so export a backup now and then.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        <Button variant="secondary" onClick={() => doExport(false)} disabled={busy}>
          <Download size={16} /> Export backup
        </Button>
        <Button variant="secondary" onClick={() => doExport(true)} disabled={busy}>
          <Download size={16} /> Export with photos
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Upload size={16} /> Import backup
        </Button>
      </div>
      <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={doImport} />
      <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
        <div>
          <p className="text-sm font-medium">Reset everything</p>
          <p className="text-xs text-subtle">Deletes all data and restarts onboarding</p>
        </div>
        <Button
          variant="danger"
          size="sm"
          onClick={async () => {
            if (!confirm("Delete ALL PROJECT 175 data on this device? This can't be undone.")) return;
            if (!confirm("Last check — export a backup first if you want one. Delete everything?")) return;
            // Sign out first so the reset stays on this device and your cloud copy is untouched.
            if (sync.userId) await sync.signOut();
            await resetAll();
          }}
        >
          <Trash2 size={15} /> Reset
        </Button>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        <Chip>Local-first</Chip>
        <Chip>{sync.configured ? (sync.userId ? "Cloud sync: on" : "Cloud sync: signed out") : "Cloud sync: not set up"}</Chip>
        <Chip>Food database: Open Food Facts</Chip>
      </div>
    </Card>
  );
}
