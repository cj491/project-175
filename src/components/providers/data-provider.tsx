"use client";

import * as React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getDB } from "@/lib/db/db";
import type { AppData } from "@/lib/app-data";
import { todayISO } from "@/lib/dates";
import type { ISODate } from "@/lib/types";
import { targetsFor } from "@/lib/domain/nutrition";

interface Ctx {
  data: AppData | undefined;
  today: ISODate;
  error: Error | null;
}

const DataContext = React.createContext<Ctx | null>(null);

/** Keeps "today" correct if the app stays open past midnight. */
function useTodayClock(): ISODate {
  const [today, setToday] = React.useState<ISODate>(() => todayISO());
  React.useEffect(() => {
    const id = setInterval(() => {
      const t = todayISO();
      setToday((prev) => (prev === t ? prev : t));
    }, 30_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function DataProvider({ children }: { children: React.ReactNode }) {
  const today = useTodayClock();
  const [error, setError] = React.useState<Error | null>(null);

  const data = useLiveQuery(async (): Promise<AppData> => {
    try {
      const db = getDB();
      const [profile, targets, foods, savedMeals, foodEntries, water, templates, sessions, steps, walks, weights, measurements, checkins, xp, achievements, photoCount] =
        await Promise.all([
          db.profile.get("me"),
          db.targets.toArray(),
          db.foods.toArray(),
          db.savedMeals.toArray(),
          db.foodEntries.toArray(),
          db.water.toArray(),
          db.templates.orderBy("order").toArray(),
          db.sessions.toArray(),
          db.steps.toArray(),
          db.walks.toArray(),
          db.weights.toArray(),
          db.measurements.toArray(),
          db.checkins.toArray(),
          db.xp.toArray(),
          db.achievements.toArray(),
          db.photos.count(),
        ]);
      return { profile, targets, foods, savedMeals, foodEntries, water, templates, sessions, steps, walks, weights, measurements, checkins, xp, achievements, photoCount };
    } catch (e) {
      setError(e as Error);
      throw e;
    }
  }, []);

  const value = React.useMemo(() => ({ data, today, error }), [data, today, error]);
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useAppData() {
  const ctx = React.useContext(DataContext);
  if (!ctx) throw new Error("useAppData must be used inside DataProvider");
  return ctx;
}

/** Convenience: data guaranteed loaded + onboarded (used inside the gated shell). */
export function useLoadedData() {
  const { data, today } = useAppData();
  if (!data || !data.profile) throw new Error("Data not loaded");
  const targets = targetsFor(data.targets, today)!;
  return { data, today, profile: data.profile, targets };
}
