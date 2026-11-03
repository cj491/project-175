"use client";

import * as React from "react";
import { Search, Star, Plus, Minus, Trash2, BookmarkPlus, Check, X, Info, Globe, Loader2, ScanBarcode } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Field, Input, Segmented, UnitInput } from "@/components/ui/form";
import { Chip, EmptyState } from "@/components/ui/misc";
import { useUI } from "@/components/providers/ui-provider";
import { useLoadedData } from "@/components/providers/data-provider";
import { localSearch, lookupBarcode, searchOnline, type FoodSearchResult } from "@/lib/integrations/food-provider";
import { BarcodeScanner } from "./barcode-scanner";
import { caloriesFromMacros, MEALS, mealItemFromFood, scaleMacros, totalMacros } from "@/lib/domain/nutrition";
import { logFoodItems, saveExternalFood, saveFood, saveMeal, toggleFoodFavorite, deleteSavedMeal } from "@/lib/db/repo";
import { foodSchema, validate } from "@/lib/validation";
import { toast } from "@/lib/events";
import type { Food, MealCategory, MealItem } from "@/lib/types";
import { cn, fmt, round } from "@/lib/utils";

export function defaultMealForNow(): MealCategory {
  const h = new Date().getHours();
  if (h < 11) return "breakfast";
  if (h < 16) return "lunch";
  if (h < 21) return "dinner";
  return "snacks";
}

type Tab = "library" | "meals" | "manual";
type Filter = "all" | "favorites" | "frequent" | "mine";

interface TrayItem extends MealItem {
  key: string;
  base: { calories: number; protein: number; carbs: number; fat: number };
}

function MacroLine({ m, className }: { m: { calories: number; protein: number; carbs: number; fat: number }; className?: string }) {
  return (
    <p className={cn("num text-xs text-muted", className)}>
      <span className="font-semibold text-fg">{fmt(m.calories)}</span> kcal · <span className="text-protein">{fmt(m.protein, 1)}P</span> ·{" "}
      <span className="text-carbs">{fmt(m.carbs, 1)}C</span> · <span className="text-fat">{fmt(m.fat, 1)}F</span>
    </p>
  );
}

export function FoodLoggerSheet() {
  const { sheet, options, closeSheet } = useUI();
  const { data, today } = useLoadedData();
  const open = sheet === "food";
  const date = options.date ?? today;

  const [tab, setTab] = React.useState<Tab>("library");
  const [meal, setMeal] = React.useState<MealCategory>("breakfast");
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<Filter>("all");
  const [tray, setTray] = React.useState<TrayItem[]>([]);
  const [savingMeal, setSavingMeal] = React.useState(false);
  const [mealName, setMealName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [online, setOnline] = React.useState<{ query: string; results: FoodSearchResult[]; loading: boolean; error: string | null }>({ query: "", results: [], loading: false, error: null });
  const [scanOpen, setScanOpen] = React.useState(false);
  const [scanBusy, setScanBusy] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setMeal(options.meal ?? defaultMealForNow());
      setTab("library");
      setQuery("");
      setFilter("all");
      setTray([]);
      setSavingMeal(false);
      setMealName("");
      setOnline({ query: "", results: [], loading: false, error: null });
    }
  }, [open, options.meal]);

  // Online search (debounced). Local results show instantly; database results follow.
  React.useEffect(() => {
    const q = query.trim();
    if (!open || tab !== "library" || filter !== "all" || q.length < 3) {
      setOnline((o) => (o.query === "" && !o.loading ? o : { query: "", results: [], loading: false, error: null }));
      return;
    }
    const ctrl = new AbortController();
    setOnline((o) => ({ ...o, loading: true, error: null }));
    const t = setTimeout(() => {
      searchOnline(q, ctrl.signal)
        .then((results) => setOnline({ query: q, results, loading: false, error: null }))
        .catch((e) => {
          if (ctrl.signal.aborted) return;
          setOnline({ query: q, results: [], loading: false, error: (e as Error).message });
        });
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query, open, tab, filter]);

  const results = React.useMemo(() => {
    let list = localSearch(data.foods, query);
    if (filter === "favorites") list = list.filter((f) => f.isFavorite);
    if (filter === "frequent") list = list.filter((f) => f.useCount > 0).sort((a, b) => b.useCount - a.useCount);
    if (filter === "mine") list = list.filter((f) => f.source === "custom");
    return list.slice(0, 60);
  }, [data.foods, query, filter]);

  const addToTray = (item: MealItem & { base?: TrayItem["base"] }) => {
    const base = item.base ?? { calories: item.calories / item.servings, protein: item.protein / item.servings, carbs: item.carbs / item.servings, fat: item.fat / item.servings };
    setTray((t) => [...t, { ...item, base, key: Math.random().toString(36).slice(2) }]);
  };
  const addFood = (f: Food) => addToTray({ ...mealItemFromFood(f, 1), base: { calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat } });
  /** Online results are saved to your library first so they're available offline next time. */
  const addOnline = async (r: FoodSearchResult) => {
    const foodId = await saveExternalFood(r);
    addToTray({ ...mealItemFromFood({ ...r, id: foodId }, 1), base: { calories: r.calories, protein: r.protein, carbs: r.carbs, fat: r.fat } });
  };

  const onBarcode = async (code: string) => {
    setScanOpen(false);
    setScanBusy(true);
    try {
      const local = data.foods.find((f) => f.externalId === `off:${code}`);
      if (local) {
        addFood(local);
        toast({ kind: "success", title: `Added ${local.name}`, detail: "From your library" });
        return;
      }
      const r = await lookupBarcode(code);
      if (!r) {
        toast({ kind: "info", title: "Product not found", detail: "Add it once with Manual entry — it'll be saved for next time." });
        setTab("manual");
        return;
      }
      await addOnline(r);
      toast({ kind: "success", title: `Found ${r.name}`, detail: `${r.servingSize} · ${r.calories} kcal` });
    } catch (e) {
      toast({ kind: "error", title: "Barcode lookup failed", detail: (e as Error).message });
    } finally {
      setScanBusy(false);
    }
  };

  const setServings = (key: string, servings: number) =>
    setTray((t) => t.map((it) => (it.key === key ? { ...it, servings, ...scaleMacros(it.base, servings) } : it)));
  const removeItem = (key: string) => setTray((t) => t.filter((it) => it.key !== key));
  const totals = totalMacros(tray);

  const logTray = async () => {
    if (!tray.length) return;
    setBusy(true);
    try {
      await logFoodItems(date, meal, tray.map(({ key: _k, base: _b, ...rest }) => rest));
      toast({ kind: "success", title: `Logged to ${MEALS.find((m) => m.key === meal)!.label}`, detail: `${fmt(totals.calories)} kcal · ${fmt(totals.protein, 1)} g protein` });
      closeSheet();
    } catch (e) {
      toast({ kind: "error", title: "Couldn't log food", detail: String(e) });
    } finally {
      setBusy(false);
    }
  };

  const saveTrayAsMeal = async () => {
    const name = mealName.trim();
    if (!name) return;
    await saveMeal(name, tray.map(({ key: _k, base: _b, ...rest }) => rest));
    toast({ kind: "success", title: `Saved meal “${name}”` });
    setSavingMeal(false);
    setMealName("");
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && closeSheet()}
      title="Log food"
      size="lg"
      footer={
        tray.length > 0 ? (
          <div className="space-y-3">
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {tray.map((it) => (
                <div key={it.key} className="flex items-center gap-2 rounded-2xl bg-surface-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{it.name}</p>
                    <MacroLine m={it} />
                  </div>
                  <div className="flex items-center gap-1">
                    <Button variant="secondary" size="icon-sm" aria-label="Fewer servings" onClick={() => setServings(it.key, Math.max(0.25, round(it.servings - 0.5, 2)))}>
                      <Minus size={14} />
                    </Button>
                    <input
                      aria-label="Servings"
                      inputMode="decimal"
                      className="num h-8 w-12 rounded-lg bg-surface-3 text-center text-sm font-semibold"
                      value={it.servings}
                      onChange={(e) => {
                        const n = Number(e.target.value);
                        if (Number.isFinite(n) && n > 0 && n <= 20) setServings(it.key, n);
                      }}
                    />
                    <Button variant="secondary" size="icon-sm" aria-label="More servings" onClick={() => setServings(it.key, round(it.servings + 0.5, 2))}>
                      <Plus size={14} />
                    </Button>
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${it.name}`} onClick={() => removeItem(it.key)}>
                      <X size={15} />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-muted">{tray.length} item{tray.length > 1 ? "s" : ""} total</span>
              <MacroLine m={totals} className="text-sm" />
            </div>
            {savingMeal ? (
              <div className="flex gap-2">
                <Input value={mealName} onChange={(e) => setMealName(e.target.value)} placeholder="Meal name, e.g. Usual breakfast" autoFocus className="h-11" maxLength={50} />
                <Button variant="secondary" onClick={saveTrayAsMeal} disabled={!mealName.trim()}>
                  Save
                </Button>
              </div>
            ) : null}
            <div className="flex gap-2">
              {!savingMeal && tray.length > 0 && (
                <Button variant="secondary" size="lg" onClick={() => setSavingMeal(true)} aria-label="Save as meal">
                  <BookmarkPlus size={18} />
                </Button>
              )}
              <Button size="lg" className="flex-1" onClick={logTray} disabled={busy}>
                <Check size={18} /> Log to {MEALS.find((m) => m.key === meal)!.label}
              </Button>
            </div>
          </div>
        ) : undefined
      }
    >
      <Segmented<MealCategory> value={meal} onChange={setMeal} options={MEALS.map((m) => ({ value: m.key, label: m.label }))} size="sm" className="mb-3" />
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: "library", label: "Foods" },
          { value: "meals", label: `Saved meals${data.savedMeals.length ? ` (${data.savedMeals.length})` : ""}` },
          { value: "manual", label: "Manual" },
        ]}
        className="mb-4"
      />

      {tab === "library" && (
        <>
          <div className="mb-3 flex gap-2">
            <div className="relative flex-1">
              <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-subtle" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search foods or brands" className="pl-11" aria-label="Search foods" />
            </div>
            <Button variant="secondary" className="h-12 w-12 px-0" onClick={() => setScanOpen(true)} disabled={scanBusy} aria-label="Scan a barcode">
              {scanBusy ? <Loader2 size={18} className="animate-spin" /> : <ScanBarcode size={20} />}
            </Button>
          </div>
          <div className="no-scrollbar mb-3 flex gap-1.5 overflow-x-auto">
            {(
              [
                ["all", "All"],
                ["favorites", "Favourites"],
                ["frequent", "Frequent"],
                ["mine", "My foods"],
              ] as [Filter, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                onClick={() => setFilter(k)}
                className={cn("h-8 shrink-0 rounded-full px-3 text-[13px] font-medium", filter === k ? "bg-fg text-bg" : "bg-surface-3 text-muted")}
              >
                {l}
              </button>
            ))}
          </div>
          {results.length === 0 && !(online.results.length || online.loading) ? (
            <EmptyState
              icon={<Search size={22} />}
              title={query ? `No match for “${query}”` : "Nothing here yet"}
              description="Add it once with Manual entry — it'll be saved to your library for next time."
              action={
                <Button variant="secondary" size="sm" onClick={() => setTab("manual")}>
                  Add manually
                </Button>
              }
            />
          ) : results.length === 0 ? null : (
            <ul className="divide-y divide-line">
              {results.map((f) => (
                <li key={f.id} className="flex items-center gap-2 py-2.5">
                  <button type="button" onClick={() => addFood(f)} className="min-w-0 flex-1 text-left">
                    <p className="truncate text-[15px] font-medium">
                      {f.name}
                      {f.source === "reference" && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-subtle">ref</span>}
                    </p>
                    <p className="truncate text-xs text-subtle">{f.servingSize}</p>
                    <MacroLine m={f} />
                  </button>
                  <Button variant="ghost" size="icon-sm" aria-label={f.isFavorite ? "Unfavourite" : "Favourite"} onClick={() => toggleFoodFavorite(f.id)}>
                    <Star size={16} className={f.isFavorite ? "fill-xp text-xp" : ""} />
                  </Button>
                  <Button variant="secondary" size="icon-sm" aria-label={`Add ${f.name}`} onClick={() => addFood(f)}>
                    <Plus size={16} />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {query.trim().length >= 3 && filter === "all" && (
            <div className="mt-4">
              <p className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-subtle">
                <Globe size={13} /> Food database
                {online.loading && <Loader2 size={13} className="animate-spin" />}
              </p>
              {online.error ? (
                <p className="rounded-2xl bg-surface-2 px-3 py-2.5 text-sm text-muted">{online.error}</p>
              ) : !online.loading && online.query && online.results.length === 0 ? (
                <p className="px-1 py-2 text-sm text-muted">No database matches. Try a brand name, or add it manually.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {online.results.map((r) => (
                    <li key={r.id} className="flex items-center gap-2 py-2.5">
                      <button type="button" onClick={() => addOnline(r)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-[15px] font-medium">{r.name}</p>
                        <p className="truncate text-xs text-subtle">
                          {r.brand ? `${r.brand} · ` : ""}
                          {r.servingSize}
                        </p>
                        <MacroLine m={r} />
                      </button>
                      <Button variant="secondary" size="icon-sm" aria-label={`Add ${r.name}`} onClick={() => addOnline(r)}>
                        <Plus size={16} />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-4 flex items-start gap-2 rounded-2xl bg-surface-2 p-3 text-xs text-subtle">
            <Info size={14} className="mt-px shrink-0" />
            <span>
              Your library shows first. Type 3+ letters to also search Open Food Facts, or scan a barcode. “ref” items are typical label values; database values come from the
              community — check them against your packaging.
            </span>
          </p>
        </>
      )}

      <BarcodeScanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={onBarcode} />
      {tab === "meals" && <SavedMealsTab onAdd={(items) => items.forEach((i) => addToTray(i))} />}
      {tab === "manual" && <ManualEntry onAdd={(item) => { addToTray(item); setTab("library"); }} />}
    </Sheet>
  );
}

function SavedMealsTab({ onAdd }: { onAdd: (items: MealItem[]) => void }) {
  const { data } = useLoadedData();
  const meals = [...data.savedMeals].sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
  if (!meals.length)
    return (
      <EmptyState
        icon={<BookmarkPlus size={22} />}
        title="No saved meals yet"
        description="Add a few foods to the tray, then tap the bookmark to save them as a reusable meal."
      />
    );
  return (
    <ul className="space-y-2">
      {meals.map((m) => {
        const t = totalMacros(m.items);
        return (
          <li key={m.id} className="flex items-center gap-2 rounded-2xl border border-line bg-surface-2 p-3">
            <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onAdd(m.items)}>
              <p className="truncate font-medium">{m.name}</p>
              <p className="truncate text-xs text-subtle">{m.items.map((i) => i.name).join(", ")}</p>
              <MacroLine m={t} />
            </button>
            <Button variant="ghost" size="icon-sm" aria-label={`Delete ${m.name}`} onClick={() => deleteSavedMeal(m.id)}>
              <Trash2 size={15} />
            </Button>
            <Button variant="secondary" size="icon-sm" aria-label={`Add ${m.name}`} onClick={() => onAdd(m.items)}>
              <Plus size={16} />
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

export function ManualEntry({ onAdd, initial }: { onAdd: (item: MealItem) => void; initial?: Partial<Food> }) {
  const [form, setForm] = React.useState({
    name: initial?.name ?? "",
    servingSize: initial?.servingSize ?? "1 serving",
    calories: initial?.calories != null ? String(initial.calories) : "",
    protein: initial?.protein != null ? String(initial.protein) : "",
    carbs: initial?.carbs != null ? String(initial.carbs) : "",
    fat: initial?.fat != null ? String(initial.fat) : "",
  });
  const [saveToLibrary, setSaveToLibrary] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const implied = caloriesFromMacros({ protein: Number(form.protein) || 0, carbs: Number(form.carbs) || 0, fat: Number(form.fat) || 0 });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const filled = { ...form, calories: form.calories === "" ? String(implied) : form.calories, protein: form.protein || "0", carbs: form.carbs || "0", fat: form.fat || "0" };
    const r = validate(foodSchema, filled);
    if (!r.ok) return setError(r.error);
    let foodId: string | undefined;
    if (saveToLibrary) foodId = await saveFood({ ...r.data, source: "custom" });
    onAdd({ foodId, name: r.data.name, servingSize: r.data.servingSize, servings: 1, calories: r.data.calories, protein: r.data.protein, carbs: r.data.carbs, fat: r.data.fat });
    toast({ kind: "info", title: "Added to tray", detail: saveToLibrary ? "Also saved to your food library" : undefined });
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Food name" htmlFor="mf-name">
        <Input id="mf-name" value={form.name} onChange={set("name")} placeholder="e.g. Chicken burrito bowl" autoFocus maxLength={80} />
      </Field>
      <Field label="Serving size" htmlFor="mf-serving">
        <Input id="mf-serving" value={form.servingSize} onChange={set("servingSize")} placeholder="1 bowl" maxLength={40} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Calories" hint={form.calories === "" && implied > 0 ? `≈ ${implied} from macros` : undefined} htmlFor="mf-cal">
          <UnitInput id="mf-cal" unit="kcal" value={form.calories} onChange={set("calories")} placeholder={implied ? String(implied) : "0"} />
        </Field>
        <Field label="Protein" htmlFor="mf-p">
          <UnitInput id="mf-p" unit="g" step="0.1" value={form.protein} onChange={set("protein")} placeholder="0" />
        </Field>
        <Field label="Carbs" htmlFor="mf-c">
          <UnitInput id="mf-c" unit="g" step="0.1" value={form.carbs} onChange={set("carbs")} placeholder="0" />
        </Field>
        <Field label="Fat" htmlFor="mf-f">
          <UnitInput id="mf-f" unit="g" step="0.1" value={form.fat} onChange={set("fat")} placeholder="0" />
        </Field>
      </div>
      <label className="flex items-center gap-2.5 px-1 py-1 text-sm text-muted">
        <input type="checkbox" checked={saveToLibrary} onChange={(e) => setSaveToLibrary(e.target.checked)} className="h-4 w-4 accent-[var(--color-lime)]" />
        Save to my food library
      </label>
      {error && <p className="text-sm text-rose">{error}</p>}
      <Button type="submit" size="lg" className="w-full">
        <Plus size={18} /> Add to tray
      </Button>
      <div className="flex flex-wrap gap-1.5 pt-1">
        <Chip>Tip: leave calories blank to calculate from macros</Chip>
      </div>
    </form>
  );
}
