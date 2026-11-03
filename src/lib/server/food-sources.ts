import "server-only";
import type { FoodSearchResult } from "../integrations/food-provider";

/**
 * Server-side food lookups. Runs only on the server so API keys (USDA) never
 * reach the browser and Open Food Facts gets the User-Agent it requires.
 */

const UA = "Project175/0.2 (personal fitness app)";
const TIMEOUT_MS = 8000;

type Nutriments = Record<string, number | string | undefined>;
interface OffProduct {
  code?: string;
  product_name?: string;
  product_name_en?: string;
  generic_name?: string;
  brands?: string | string[];
  serving_size?: string;
  serving_quantity?: number | string;
  nutriments?: Nutriments;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN);

async function fetchJson(url: string, init: RequestInit = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "application/json", ...(init.headers ?? {}) } });
    if (!res.ok) throw new Error(`${new URL(url).host} responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/** Converts an Open Food Facts product to one serving (or 100 g when no serving is listed). */
export function mapOffProduct(p: OffProduct): FoodSearchResult | null {
  const n = p.nutriments ?? {};
  const brandName = (Array.isArray(p.brands) ? p.brands[0] : p.brands?.split(",")[0])?.trim();
  let name = (p.product_name || p.product_name_en || "").trim();
  // Some community entries use only the brand as the product name — fall back to the generic name.
  if (brandName && name.toLowerCase() === brandName.toLowerCase()) name = (p.generic_name ?? "").trim();
  if (brandName && name.toLowerCase() === brandName.toLowerCase()) name = "";
  let kcal100 = num(n["energy-kcal_100g"]);
  if (!Number.isFinite(kcal100)) {
    const kj = num(n["energy-kj_100g"] ?? n["energy_100g"]);
    if (Number.isFinite(kj)) kcal100 = kj / 4.184;
  }
  if (!name || !p.code || !Number.isFinite(kcal100)) return null;
  const per100 = {
    calories: kcal100,
    protein: num(n.proteins_100g) || 0,
    carbs: num(n.carbohydrates_100g) || 0,
    fat: num(n.fat_100g) || 0,
  };
  const servingG = num(p.serving_quantity);
  const hasServing = Number.isFinite(servingG) && servingG > 0 && servingG < 2000;
  const f = hasServing ? servingG / 100 : 1;
  const brand = brandName;
  return {
    id: `off:${p.code}`,
    externalId: `off:${p.code}`,
    name,
    brand: brand?.trim() || undefined,
    servingSize: hasServing ? (p.serving_size?.trim() || `${servingG} g`) : "100 g",
    calories: Math.round(per100.calories * f),
    protein: r1(per100.protein * f),
    carbs: r1(per100.carbs * f),
    fat: r1(per100.fat * f),
    source: "external",
  };
}

const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,nutriments";

/** Drops exact duplicates (same name, brand and calories) that community databases often contain. */
function dedupe(list: FoodSearchResult[]) {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = `${r.name.toLowerCase()}|${(r.brand ?? "").toLowerCase()}|${r.calories}|${r.servingSize}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function searchOpenFoodFacts(q: string, limit = 20): Promise<FoodSearchResult[]> {
  const url = `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=${limit}&fields=${OFF_FIELDS}`;
  const json = await fetchJson(url);
  return dedupe(((json.hits ?? []) as OffProduct[]).map(mapOffProduct).filter((x): x is FoodSearchResult => !!x));
}

export async function lookupBarcodeOFF(code: string): Promise<FoodSearchResult | null> {
  const json = await fetchJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${OFF_FIELDS}`);
  if (json.status !== 1 || !json.product) return null;
  return mapOffProduct({ ...json.product, code });
}

interface UsdaFood {
  fdcId: number;
  description: string;
  brandOwner?: string;
  brandName?: string;
  dataType?: string;
  servingSize?: number;
  servingSizeUnit?: string;
  householdServingFullText?: string;
  foodNutrients?: { nutrientId?: number; nutrientNumber?: string; value?: number }[];
}

/** USDA FoodData Central — only used when USDA_API_KEY is set on the server. */
export async function searchUSDA(q: string, limit = 10): Promise<FoodSearchResult[]> {
  const key = process.env.USDA_API_KEY;
  if (!key) return [];
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?query=${encodeURIComponent(q)}&pageSize=${limit}&dataType=Foundation,SR%20Legacy,Branded&api_key=${encodeURIComponent(key)}`;
  const json = await fetchJson(url);
  return ((json.foods ?? []) as UsdaFood[])
    .map((f): FoodSearchResult | null => {
      const get = (id: number, numStr: string) => f.foodNutrients?.find((x) => x.nutrientId === id || x.nutrientNumber === numStr)?.value ?? NaN;
      const kcal = get(1008, "208");
      if (!Number.isFinite(kcal)) return null;
      // Branded foods report per 100 g; scale to the labelled serving when it's in grams.
      const g = f.dataType === "Branded" && f.servingSizeUnit?.toLowerCase() === "g" && f.servingSize ? f.servingSize : 100;
      const k = g / 100;
      return {
        id: `usda:${f.fdcId}`,
        externalId: `usda:${f.fdcId}`,
        name: f.description.charAt(0) + f.description.slice(1).toLowerCase(),
        brand: f.brandName || f.brandOwner || undefined,
        servingSize: g === 100 ? "100 g" : f.householdServingFullText ? `${f.householdServingFullText} (${g} g)` : `${g} g`,
        calories: Math.round(kcal * k),
        protein: r1((get(1003, "203") || 0) * k),
        carbs: r1((get(1005, "205") || 0) * k),
        fat: r1((get(1004, "204") || 0) * k),
        source: "external",
      };
    })
    .filter((x): x is FoodSearchResult => !!x);
}

/** Tiny in-memory cache so repeated searches don't hit the public APIs. */
const cache = new Map<string, { at: number; value: unknown }>();
export async function cached<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await fn();
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}
