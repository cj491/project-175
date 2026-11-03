import type { Food, Macros } from "../types";

/**
 * Food search abstraction.
 *
 * Today only the LocalFoodProvider exists (your own library + reference
 * foods). A remote provider — e.g. USDA FoodData Central, Open Food Facts, or a
 * barcode API — can implement this same interface. Remote calls that need an
 * API key must go through a server route (app/api/...) so keys never ship to
 * the browser.
 */
export interface FoodSearchResult extends Macros {
  id: string;
  name: string;
  brand?: string;
  servingSize: string;
  source: Food["source"];
  externalId?: string;
}

export interface FoodProvider {
  id: string;
  label: string;
  available: boolean;
  search(query: string): Promise<FoodSearchResult[]>;
  lookupBarcode?(code: string): Promise<FoodSearchResult | null>;
}

export function localSearch(foods: Food[], query: string): Food[] {
  const q = query.trim().toLowerCase();
  const scored = foods
    .map((f) => {
      const name = f.name.toLowerCase();
      let score = 0;
      if (!q) score = 1;
      else if (name.startsWith(q)) score = 3;
      else if (name.split(/[\s,]+/).some((w) => w.startsWith(q))) score = 2;
      else if (name.includes(q) || f.brand?.toLowerCase().includes(q)) score = 1;
      if (score === 0) return null;
      // Favourites and frequently used foods float to the top.
      score += (f.isFavorite ? 2 : 0) + Math.min(2, f.useCount / 5) + (f.source === "custom" ? 0.5 : 0);
      return { f, score };
    })
    .filter(Boolean) as { f: Food; score: number }[];
  return scored.sort((a, b) => b.score - a.score || a.f.name.localeCompare(b.f.name)).map((s) => s.f);
}

/**
 * Online provider: calls this app's own /api/foods routes (Open Food Facts,
 * plus USDA when the server has a key). In the native app the API lives on
 * the deployed site, set with NEXT_PUBLIC_API_BASE.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

export class FoodApiError extends Error {}

export async function searchOnline(query: string, signal?: AbortSignal): Promise<FoodSearchResult[]> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new FoodApiError("You're offline — showing your library only");
  const res = await fetch(`${API_BASE}/api/foods/search?q=${encodeURIComponent(query)}`, { signal });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new FoodApiError(json.error ?? "Food database unavailable");
  return json.results ?? [];
}

export async function lookupBarcode(code: string): Promise<FoodSearchResult | null> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new FoodApiError("You're offline — barcode lookup needs a connection");
  const res = await fetch(`${API_BASE}/api/foods/barcode?code=${encodeURIComponent(code)}`);
  if (res.status === 404) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new FoodApiError(json.error ?? "Food database unavailable");
  return json.result ?? null;
}

export const ONLINE_FOOD_PROVIDER: Pick<FoodProvider, "id" | "label" | "available"> = {
  id: "online",
  label: "Open Food Facts",
  available: true,
};
