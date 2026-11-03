"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Copy, Droplet, Pencil, Plus, Star, Trash2, Undo2, BookOpen, CalendarDays } from "lucide-react";
import { Page, PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { ProgressBar, ProgressRing } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { Field, Input, Segmented, UnitInput } from "@/components/ui/form";
import { EmptyState, Chip } from "@/components/ui/misc";
import { useLoadedData } from "@/components/providers/data-provider";
import { useUI } from "@/components/providers/ui-provider";
import { addDays, formatDate, formatRelativeDay, formatTime, lastNDays } from "@/lib/dates";
import { dayTotals, entriesOn, macroCalorieSplit, MEALS, targetsFor, totalMacros, waterOn } from "@/lib/domain/nutrition";
import { addWater, deleteFood, deleteFoodEntry, duplicateMeal, saveFood, undoLastWater, updateFoodEntry, toggleFoodFavorite } from "@/lib/db/repo";
import { foodSchema, macrosSchema, validate } from "@/lib/validation";
import { toast } from "@/lib/events";
import type { Food, FoodEntry, MealCategory } from "@/lib/types";
import { cn, fmt, round } from "@/lib/utils";

export function NutritionScreen() {
  const { data, today } = useLoadedData();
  const { openSheet } = useUI();
  const [date, setDate] = React.useState(today);
  const [editing, setEditing] = React.useState<FoodEntry | null>(null);
  const [libraryOpen, setLibraryOpen] = React.useState(false);

  // Deep link from missions: /nutrition?meal=lunch opens the logger.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const meal = params.get("meal") as MealCategory | null;
    if (meal && MEALS.some((m) => m.key === meal)) {
      openSheet("food", { meal });
      window.history.replaceState(null, "", "/nutrition");
    }
    if (window.location.hash === "#water") document.getElementById("water")?.scrollIntoView({ behavior: "smooth" });
  }, [openSheet]);

  const targets = targetsFor(data.targets, date)!;
  const totals = dayTotals(data.foodEntries, date);
  const entries = entriesOn(data.foodEntries, date);
  const water = waterOn(data.water, date);
  const split = macroCalorieSplit(totals);
  const targetSplit = macroCalorieSplit(targets);
  const isToday = date === today;
  const yesterday = addDays(date, -1);

  return (
    <Page>
      <PageHeader title="Nutrition" subtitle="Fuel the transformation" />

      {/* Date navigator */}
      <div className="mb-4 flex items-center justify-between rounded-2xl border border-line bg-surface p-1.5">
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
          <ChevronLeft size={20} />
        </Button>
        <button type="button" onClick={() => setDate(today)} className="flex items-center gap-2 text-[15px] font-semibold">
          <CalendarDays size={16} className="text-muted" />
          {formatRelativeDay(date, today)}
          {!isToday && <span className="text-xs font-medium text-lime">Back to today</span>}
        </button>
        <Button variant="ghost" size="icon" onClick={() => setDate(addDays(date, 1))} disabled={isToday} aria-label="Next day">
          <ChevronRight size={20} />
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <div className="flex items-center gap-5">
            <ProgressRing value={totals.calories / targets.calories} size={128} stroke={12} color={totals.calories > targets.calories ? "var(--color-amber)" : "var(--color-lime)"} label="Calories">
              <div className="text-center">
                <p className="num text-2xl font-bold leading-none">{fmt(totals.calories)}</p>
                <p className="mt-0.5 text-[11px] text-muted">of {fmt(targets.calories)}</p>
              </div>
            </ProgressRing>
            <div className="flex-1">
              <p className="text-xs font-medium text-muted">Protein remaining</p>
              <p className="num text-4xl font-bold text-protein">
                {fmt(Math.max(0, targets.protein - totals.protein))}
                <span className="ml-1 text-base font-medium text-subtle">g</span>
              </p>
              <p className="num mt-1 text-sm text-muted">
                {fmt(totals.protein)} / {targets.protein} g eaten
              </p>
              <p className="num mt-2 text-sm text-muted">
                {totals.calories <= targets.calories ? `${fmt(targets.calories - totals.calories)} kcal left` : `${fmt(totals.calories - targets.calories)} kcal over`}
              </p>
            </div>
          </div>

          <div className="mt-5 space-y-3">
            {(
              [
                ["Protein", totals.protein, targets.protein, "var(--color-protein)"],
                ["Carbs", totals.carbs, targets.carbs, "var(--color-carbs)"],
                ["Fat", totals.fat, targets.fat, "var(--color-fat)"],
              ] as const
            ).map(([l, v, t, c]) => (
              <div key={l}>
                <div className="mb-1 flex justify-between text-sm">
                  <span>{l}</span>
                  <span className="num text-muted">
                    {fmt(v)} / {t} g · <span className="text-subtle">{v >= t ? "done" : `${fmt(t - v)} left`}</span>
                  </span>
                </div>
                <ProgressBar value={v / t} color={c} height={7} label={`${l} progress`} />
              </div>
            ))}
          </div>

          <div className="mt-5">
            <p className="mb-2 text-xs font-medium text-muted">Calorie split (eaten vs. target)</p>
            {[
              ["Eaten", split, totals.calories > 0],
              ["Target", targetSplit, true],
            ].map(([label, s, show]) => {
              const sp = s as typeof split;
              return (
                <div key={label as string} className="mb-1.5 flex items-center gap-2">
                  <span className="w-10 shrink-0 text-[11px] text-subtle">{label as string}</span>
                  <div className="flex h-3 min-w-0 flex-1 gap-0.5 overflow-hidden rounded-full bg-surface-3">
                    {show ? (
                      <>
                        <div style={{ width: `${sp.protein * 100}%`, background: "var(--color-protein)" }} />
                        <div style={{ width: `${sp.carbs * 100}%`, background: "var(--color-carbs)" }} />
                        <div style={{ width: `${sp.fat * 100}%`, background: "var(--color-fat)" }} />
                      </>
                    ) : null}
                  </div>
                  <span className="num w-16 shrink-0 text-right text-[11px] text-subtle">
                    {show ? `${Math.round(sp.protein * 100)}/${Math.round(sp.carbs * 100)}/${Math.round(sp.fat * 100)}` : "—"}
                  </span>
                </div>
              );
            })}
            <p className="text-[11px] text-subtle">Protein / carbs / fat as % of calories</p>
          </div>
        </Card>

        <div className="space-y-3 lg:col-span-7">
          {MEALS.map((m) => {
            const list = entries.filter((e) => e.meal === m.key).sort((a, b) => a.loggedAt.localeCompare(b.loggedAt));
            const mt = totalMacros(list);
            const yesterdayHas = data.foodEntries.some((e) => e.date === yesterday && e.meal === m.key);
            return (
              <Card key={m.key} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold">{m.label}</h3>
                    <p className="num text-xs text-muted">
                      {list.length ? `${fmt(mt.calories)} kcal · ${fmt(mt.protein)} g protein` : "Nothing logged"}
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {list.length === 0 && yesterdayHas && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const n = await duplicateMeal(yesterday, m.key, date, m.key);
                          toast({ kind: "success", title: `Copied ${n} item${n > 1 ? "s" : ""} from yesterday` });
                        }}
                      >
                        <Copy size={14} /> Same as yesterday
                      </Button>
                    )}
                    {!isToday && list.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          const n = await duplicateMeal(date, m.key, today, m.key);
                          toast({ kind: "success", title: `Copied ${n} item${n > 1 ? "s" : ""} to today` });
                        }}
                      >
                        <Copy size={14} /> To today
                      </Button>
                    )}
                    <Button variant="secondary" size="icon-sm" onClick={() => openSheet("food", { meal: m.key, date })} aria-label={`Add to ${m.label}`}>
                      <Plus size={16} />
                    </Button>
                  </div>
                </div>
                {list.length > 0 && (
                  <ul className="mt-3 divide-y divide-line border-t border-line">
                    {list.map((e) => (
                      <li key={e.id} className="flex items-center gap-2 py-2.5">
                        <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(e)}>
                          <p className="truncate text-[15px] font-medium">{e.name}</p>
                          <p className="num truncate text-xs text-subtle">
                            {e.servings !== 1 ? `${e.servings} × ` : ""}
                            {e.servingSize} · {formatTime(e.loggedAt)}
                          </p>
                        </button>
                        <div className="num text-right text-xs">
                          <p className="font-semibold text-fg">{fmt(e.calories)} kcal</p>
                          <p className="text-subtle">
                            <span className="text-protein">{fmt(e.protein)}</span>/<span className="text-carbs">{fmt(e.carbs)}</span>/<span className="text-fat">{fmt(e.fat)}</span>
                          </p>
                        </div>
                        <Button variant="ghost" size="icon-sm" aria-label={`Edit ${e.name}`} onClick={() => setEditing(e)}>
                          <Pencil size={14} />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            );
          })}
        </div>

        <Card className="lg:col-span-5" id="water">
          <CardHeader title="Water" subtitle={`${fmt(water / 1000, 2)} of ${fmt(targets.waterMl / 1000, 1)} L`} icon={<Droplet size={16} className="text-water" />} />
          <ProgressBar value={water / targets.waterMl} color="var(--color-water)" height={10} label="Water" />
          <div className="mt-4 flex gap-2">
            {[250, 500].map((ml) => (
              <Button key={ml} variant="secondary" className="flex-1" onClick={() => addWater(date, ml)}>
                +{ml} ml
              </Button>
            ))}
            <Button variant="ghost" size="icon" aria-label="Undo last water" onClick={() => undoLastWater(date)} disabled={!water}>
              <Undo2 size={17} />
            </Button>
          </div>
        </Card>

        <Card className="lg:col-span-7">
          <CardHeader
            title="Last 7 days"
            subtitle="Tap a day to view or edit it"
            action={
              <Button variant="secondary" size="sm" onClick={() => setLibraryOpen(true)}>
                <BookOpen size={15} /> Food library
              </Button>
            }
          />
          <ul className="space-y-1">
            {lastNDays(today, 7)
              .filter((d) => d >= data.profile!.startDate)
              .reverse()
              .map((d) => {
                const t = dayTotals(data.foodEntries, d);
                const tg = targetsFor(data.targets, d)!;
                return (
                  <li key={d}>
                    <button
                      type="button"
                      onClick={() => setDate(d)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2", d === date && "bg-surface-2")}
                    >
                      <span className="w-20 text-sm text-muted">{formatRelativeDay(d, today)}</span>
                      <div className="flex-1">
                        <ProgressBar value={t.calories / tg.calories} height={5} color={t.calories > tg.calories ? "var(--color-amber)" : "var(--color-lime)"} />
                      </div>
                      <span className="num w-20 text-right text-sm font-medium">{t.calories ? `${fmt(t.calories)}` : "—"}</span>
                      <span className={cn("num w-14 text-right text-xs", t.protein >= tg.protein ? "text-protein" : "text-subtle")}>{t.protein ? `${fmt(t.protein)}g P` : ""}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        </Card>
      </div>

      <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />
      <FoodLibrarySheet open={libraryOpen} onClose={() => setLibraryOpen(false)} />
    </Page>
  );
}

function EditEntrySheet({ entry, onClose }: { entry: FoodEntry | null; onClose: () => void }) {
  const [form, setForm] = React.useState({ name: "", servings: "1", calories: "", protein: "", carbs: "", fat: "" });
  const [meal, setMeal] = React.useState<MealCategory>("breakfast");
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (entry) {
      setForm({ name: entry.name, servings: String(entry.servings), calories: String(entry.calories), protein: String(entry.protein), carbs: String(entry.carbs), fat: String(entry.fat) });
      setMeal(entry.meal);
      setError(null);
    }
  }, [entry]);
  if (!entry) return null;

  // Changing servings rescales macros proportionally.
  const onServings = (v: string) => {
    const n = Number(v);
    setForm((f) => {
      if (!Number.isFinite(n) || n <= 0) return { ...f, servings: v };
      const ratio = n / entry.servings;
      return {
        ...f,
        servings: v,
        calories: String(round(entry.calories * ratio)),
        protein: String(round(entry.protein * ratio, 1)),
        carbs: String(round(entry.carbs * ratio, 1)),
        fat: String(round(entry.fat * ratio, 1)),
      };
    });
  };
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(macrosSchema, form);
    if (!r.ok) return setError(r.error);
    const servings = Number(form.servings);
    if (!Number.isFinite(servings) || servings <= 0) return setError("Servings must be greater than 0");
    await updateFoodEntry(entry.id, { ...r.data, name: form.name.trim() || entry.name, servings, meal });
    toast({ kind: "success", title: "Entry updated" });
    onClose();
  };

  return (
    <Sheet open={!!entry} onOpenChange={(o) => !o && onClose()} title="Edit entry" description={formatDate(entry.date, { weekday: "long", month: "short", day: "numeric" })}>
      <form onSubmit={save} className="space-y-3">
        <Segmented<MealCategory> value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.key, label: m.label }))} size="sm" />
        <Field label="Name" htmlFor="ee-name">
          <Input id="ee-name" value={form.name} onChange={set("name")} maxLength={80} />
        </Field>
        <Field label={`Servings (${entry.servingSize})`} htmlFor="ee-serv" hint="Changing servings rescales the macros">
          <UnitInput id="ee-serv" unit="×" step="0.25" value={form.servings} onChange={(e) => onServings(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Calories" htmlFor="ee-cal">
            <UnitInput id="ee-cal" unit="kcal" value={form.calories} onChange={set("calories")} />
          </Field>
          <Field label="Protein" htmlFor="ee-p">
            <UnitInput id="ee-p" unit="g" step="0.1" value={form.protein} onChange={set("protein")} />
          </Field>
          <Field label="Carbs" htmlFor="ee-c">
            <UnitInput id="ee-c" unit="g" step="0.1" value={form.carbs} onChange={set("carbs")} />
          </Field>
          <Field label="Fat" htmlFor="ee-f">
            <UnitInput id="ee-f" unit="g" step="0.1" value={form.fat} onChange={set("fat")} />
          </Field>
        </div>
        {error && <p className="text-sm text-rose">{error}</p>}
        <div className="flex gap-2 pt-2">
          <Button
            variant="danger"
            size="lg"
            onClick={async () => {
              await deleteFoodEntry(entry.id);
              toast({ kind: "info", title: `Removed ${entry.name}` });
              onClose();
            }}
          >
            <Trash2 size={17} /> Delete
          </Button>
          <Button type="submit" size="lg" className="flex-1">
            Save changes
          </Button>
        </div>
      </form>
    </Sheet>
  );
}

function FoodLibrarySheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useLoadedData();
  const [editing, setEditing] = React.useState<Partial<Food> | null>(null);
  const [q, setQ] = React.useState("");
  const foods = [...data.foods]
    .filter((f) => !q || f.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(b.isFavorite) - Number(a.isFavorite) || Number(b.source === "custom") - Number(a.source === "custom") || a.name.localeCompare(b.name));

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()} title="Food library" description={`${data.foods.length} foods · stored on this device`} size="lg">
      {editing ? (
        <FoodForm food={editing} onDone={() => setEditing(null)} />
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter foods" aria-label="Filter foods" className="h-11" />
            <Button className="h-11" onClick={() => setEditing({})}>
              <Plus size={16} /> New
            </Button>
          </div>
          {foods.length === 0 ? (
            <EmptyState icon={<BookOpen size={22} />} title="No foods match" />
          ) : (
            <ul className="divide-y divide-line">
              {foods.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {f.name} <Chip className="ml-1 px-1.5 py-0 text-[10px]">{f.source === "custom" ? "mine" : f.source === "external" ? "db" : "ref"}</Chip>
                    </p>
                    <p className="num truncate text-xs text-subtle">
                      {f.servingSize} · {f.calories} kcal · {f.protein}P {f.carbs}C {f.fat}F{f.useCount ? ` · used ${f.useCount}×` : ""}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon-sm" aria-label="Favourite" onClick={() => toggleFoodFavorite(f.id)}>
                    <Star size={15} className={f.isFavorite ? "fill-xp text-xp" : ""} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Edit ${f.name}`} onClick={() => setEditing(f)}>
                    <Pencil size={14} />
                  </Button>
                  <Button variant="ghost" size="icon-sm" aria-label={`Delete ${f.name}`} onClick={() => deleteFood(f.id)}>
                    <Trash2 size={14} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Sheet>
  );
}

function FoodForm({ food, onDone }: { food: Partial<Food>; onDone: () => void }) {
  const [form, setForm] = React.useState({
    name: food.name ?? "",
    brand: food.brand ?? "",
    servingSize: food.servingSize ?? "1 serving",
    calories: food.calories != null ? String(food.calories) : "",
    protein: food.protein != null ? String(food.protein) : "",
    carbs: food.carbs != null ? String(food.carbs) : "",
    fat: food.fat != null ? String(food.fat) : "",
  });
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = validate(foodSchema, { ...form, brand: form.brand || undefined });
    if (!r.ok) return setError(r.error);
    await saveFood({ ...r.data, id: food.id, source: food.id ? food.source ?? "custom" : "custom" });
    toast({ kind: "success", title: food.id ? "Food updated" : "Food added to library" });
    onDone();
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Name" htmlFor="ff-name">
        <Input id="ff-name" value={form.name} onChange={set("name")} autoFocus maxLength={80} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Brand (optional)" htmlFor="ff-brand">
          <Input id="ff-brand" value={form.brand} onChange={set("brand")} maxLength={60} />
        </Field>
        <Field label="Serving size" htmlFor="ff-serv">
          <Input id="ff-serv" value={form.servingSize} onChange={set("servingSize")} maxLength={40} />
        </Field>
        <Field label="Calories" htmlFor="ff-cal">
          <UnitInput id="ff-cal" unit="kcal" value={form.calories} onChange={set("calories")} />
        </Field>
        <Field label="Protein" htmlFor="ff-p">
          <UnitInput id="ff-p" unit="g" step="0.1" value={form.protein} onChange={set("protein")} />
        </Field>
        <Field label="Carbs" htmlFor="ff-c">
          <UnitInput id="ff-c" unit="g" step="0.1" value={form.carbs} onChange={set("carbs")} />
        </Field>
        <Field label="Fat" htmlFor="ff-f">
          <UnitInput id="ff-f" unit="g" step="0.1" value={form.fat} onChange={set("fat")} />
        </Field>
      </div>
      {error && <p className="text-sm text-rose">{error}</p>}
      <div className="flex gap-2 pt-1">
        <Button variant="secondary" size="lg" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="lg" className="flex-1">
          {food.id ? "Save food" : "Add food"}
        </Button>
      </div>
    </form>
  );
}
