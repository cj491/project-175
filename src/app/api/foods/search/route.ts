import { cached, searchOpenFoodFacts, searchUSDA } from "@/lib/server/food-sources";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) return Response.json({ results: [], error: "Query must be 2–80 characters" }, { status: 400 });

  const key = q.toLowerCase();
  const [off, usda] = await Promise.allSettled([
    cached(`off:${key}`, 10 * 60_000, () => searchOpenFoodFacts(q)),
    cached(`usda:${key}`, 10 * 60_000, () => searchUSDA(q)),
  ]);
  const results = [...(usda.status === "fulfilled" ? usda.value : []), ...(off.status === "fulfilled" ? off.value : [])];
  const failed = off.status === "rejected" && (usda.status === "rejected" || !process.env.USDA_API_KEY);
  return Response.json(
    {
      results: results.slice(0, 30),
      sources: ["Open Food Facts", ...(process.env.USDA_API_KEY ? ["USDA FoodData Central"] : [])],
      error: failed ? "Food database unavailable right now" : undefined,
    },
    { status: failed ? 502 : 200, headers: { "Cache-Control": "private, max-age=300" } }
  );
}
