import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { mapOffProduct } = await import("./food-sources");

describe("Open Food Facts mapping", () => {
  it("scales per-100g values to the labelled serving", () => {
    const r = mapOffProduct({
      code: "123",
      product_name: "Greek yogurt",
      brands: "Chobani, Other",
      serving_size: "1 cup (227 g)",
      serving_quantity: 227,
      nutriments: { "energy-kcal_100g": 52.9, proteins_100g: 9.41, carbohydrates_100g: 3.53, fat_100g: 0 },
    });
    expect(r).toMatchObject({ externalId: "off:123", brand: "Chobani", servingSize: "1 cup (227 g)", calories: 120, protein: 21.4, carbs: 8, fat: 0, source: "external" });
  });

  it("falls back to 100 g and converts kJ when kcal is missing", () => {
    const r = mapOffProduct({ code: "9", product_name: "Oats", nutriments: { "energy-kj_100g": 1556, proteins_100g: 13 } });
    expect(r).toMatchObject({ servingSize: "100 g", calories: 372, protein: 13, carbs: 0 });
  });

  it("uses the generic name when the product name is just the brand", () => {
    expect(mapOffProduct({ code: "2", product_name: "Chobani", generic_name: "Strawberry yogurt", brands: "Chobani", nutriments: { "energy-kcal_100g": 80 } })?.name).toBe("Strawberry yogurt");
    expect(mapOffProduct({ code: "3", product_name: "Chobani", brands: "Chobani", nutriments: { "energy-kcal_100g": 80 } })).toBeNull();
  });

  it("drops products without a name or energy value", () => {
    expect(mapOffProduct({ code: "1", nutriments: { "energy-kcal_100g": 100 } })).toBeNull();
    expect(mapOffProduct({ code: "1", product_name: "Mystery" })).toBeNull();
  });
});
