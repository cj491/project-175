import { cached, lookupBarcodeOFF } from "@/lib/server/food-sources";

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.replace(/\D/g, "") ?? "";
  if (code.length < 6 || code.length > 14) return Response.json({ result: null, error: "Invalid barcode" }, { status: 400 });
  try {
    const result = await cached(`bc:${code}`, 60 * 60_000, () => lookupBarcodeOFF(code));
    return Response.json({ result }, { status: result ? 200 : 404, headers: { "Cache-Control": "private, max-age=3600" } });
  } catch {
    return Response.json({ result: null, error: "Food database unavailable right now" }, { status: 502 });
  }
}
