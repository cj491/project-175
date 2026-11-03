"use client";

import * as React from "react";
import type { MealCategory } from "@/lib/types";

export type SheetName = "quick" | "food" | "weight" | "steps" | "walk" | "water" | "checkin";

export interface SheetOptions {
  meal?: MealCategory;
  date?: string;
}

interface UICtx {
  sheet: SheetName | null;
  options: SheetOptions;
  openSheet: (name: SheetName, options?: SheetOptions) => void;
  closeSheet: () => void;
}

const Ctx = React.createContext<UICtx | null>(null);

export function UIProvider({ children }: { children: React.ReactNode }) {
  const [sheet, setSheet] = React.useState<SheetName | null>(null);
  const [options, setOptions] = React.useState<SheetOptions>({});
  const openSheet = React.useCallback((name: SheetName, opts: SheetOptions = {}) => {
    setOptions(opts);
    setSheet(name);
  }, []);
  const closeSheet = React.useCallback(() => setSheet(null), []);
  const value = React.useMemo(() => ({ sheet, options, openSheet, closeSheet }), [sheet, options, openSheet, closeSheet]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUI() {
  const c = React.useContext(Ctx);
  if (!c) throw new Error("useUI must be used inside UIProvider");
  return c;
}
