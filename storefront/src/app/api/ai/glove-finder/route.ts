import { NextRequest, NextResponse } from "next/server";
import { GloveFinderRequestSchema, GloveFinderResponseSchema } from "@/lib/ai/schemas";
import { runJsonResponse } from "@/lib/ai/client";
import { checkAiRateLimit } from "@/lib/ai/middleware";

export const runtime = "nodejs";
export const maxDuration = 30;

const AI_MAX_CANDIDATES = Math.min(
  Math.max(1, parseInt(process.env.AI_MAX_CANDIDATES ?? "30", 10)),
  100
);

/** Static mock candidate SKUs when DB is not wired. Replace with getActiveProducts() when Supabase is ready. */
function getCandidateSkus(): { sku: string; name: string; material: string; thickness_mil: number | null; glove_type: string; price_cents: number }[] {
  return [
    { sku: "GC-NIT-6", name: "Nitrile Exam Glove 6mil", material: "Nitrile", thickness_mil: 6, glove_type: "disposable", price_cents: 1299 },
    { sku: "GC-NIT-8", name: "Nitrile Heavy Duty 8mil", material: "Nitrile", thickness_mil: 8, glove_type: "disposable", price_cents: 1899 },
    { sku: "GC-VIN-4", name: "Vinyl General Purpose", material: "Vinyl", thickness_mil: 4, glove_type: "disposable", price_cents: 699 },
    { sku: "GC-LAT-6", name: "Latex Exam Glove", material: "Latex", thickness_mil: 6, glove_type: "disposable", price_cents: 999 },
    { sku: "GC-NIT-FS", name: "Nitrile Food Safe", material: "Nitrile", thickness_mil: 5, glove_type: "disposable", price_cents: 1499 },
  ];
}

/** GET: health check so you can verify the route is reachable (no OpenAI call). */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "glove-finder",
    message: "POST with JSON body to get recommendations.",
  });
}

export async function POST(request: NextRequest) {
  try {
    const rate = checkAiRateLimit(request);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: "Too many requests", retryAfterMs: rate.retryAfterMs },
        { status: 429, headers: rate.retryAfterMs ? { "Retry-After": String(Math.ceil(rate.retryAfterMs / 1000)) } : undefined }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      console.error("[glove-finder] Invalid JSON body");
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const parsed = GloveFinderRequestSchema.safeParse(body);
    if (!parsed.success) {
      console.error("[glove-finder] Validation failed:", parsed.error.flatten());
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const candidates = getCandidateSkus().slice(0, AI_MAX_CANDIDATES);
    const candidateList = candidates
      .map((c) => `- ${c.sku}: ${c.name} (${c.material}, ${c.thickness_mil ?? "?"}mil, $${(c.price_cents / 100).toFixed(2)})`)
      .join("\n");

    const systemPrompt = [
      "You are an industrial glove expert. Choose the best 3 SKUs from the provided candidate list based on the user's industry, hazards, latex allergy, thickness preference, and budget.",
      "Return ONLY valid JSON with this exact shape: { \"constraints\": string[], \"top_picks\": [ { \"sku\": string, \"reason\": string, \"tradeoffs\": string[] } ], \"followup_questions\"?: string[] }.",
      "Only use SKUs from the candidate list. Include exactly 3 top_picks when possible.",
    ].join(" ");

    const userPrompt = [
      "Candidates:",
      candidateList,
      "",
      "User:",
      `Industry: ${parsed.data.industry}`,
      `Hazards: ${parsed.data.hazards.join(", ") || "none"}`,
      `Latex allergy: ${parsed.data.latexAllergy}`,
      `Thickness preference: ${parsed.data.thicknessPreference ?? "any"}`,
      `Budget: ${parsed.data.budgetLevel ?? "any"}`,
      parsed.data.notes ? `Notes: ${parsed.data.notes}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const result = await runJsonResponse({
      systemPrompt,
      userPrompt,
      schema: GloveFinderResponseSchema,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[glove-finder] Error:", e);
    return NextResponse.json(
      { error: "Recommendation service unavailable. Please try again." },
      { status: 500 }
    );
  }
}
