/**
 * Canonical **prep-line / ontology** glove intelligence on the Next storefront.
 * Wizard-style recommendations use **POST /api/gloves/recommend** (rules + optional LLM rerank, different request/response contract).
 * Legacy Express **POST /api/ai/glove-finder** remains for backward compatibility; prefer this route for new callers on the storefront origin.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  GloveFinderRequestSchema,
  GloveFinderResponseSchema,
  type GloveFinderResponse,
} from "@/lib/ai/schemas";
import { runJsonResponse } from "@/lib/ai/client";
import { checkAiRateLimit } from "@/lib/ai/middleware";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchStoreProductRowsByIds } from "@/lib/catalog/store-products";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import { fetchRestaurantPrepLineCandidateProductIds } from "@/lib/ontology/prep-line-candidates";
import { RESTAURANT_PREP_LINE_ENVIRONMENT_KEY } from "@/lib/ontology/operational-environments";
import { appendGloveFinderAdvisoryEvent, ensureGloveFinderOpportunity } from "@/lib/procurement/spine-writes";
import { projectPrepLineCardFacts } from "@/lib/prep-line/card-projection";
import { PrepLineOperationalCopy } from "@/lib/prep-line/operational-copy";
import { logPublicFunnel } from "@/lib/observability/public-funnel-log";

export const runtime = "nodejs";
export const maxDuration = 30;

const AI_MAX_CANDIDATES = Math.min(
  Math.max(1, parseInt(process.env.AI_MAX_CANDIDATES ?? "30", 10)),
  100
);

/** OpenAI JSON shape — mapped to {@link GloveFinderResponse} before leaving this route. */
const gloveFinderOpenAiResponseSchema = z.object({
  constraints: z.array(z.string()),
  top_picks: z.array(
    z.object({
      sku: z.string(),
      reason: z.string(),
      tradeoffs: z.array(z.string()),
    })
  ),
  followup_questions: z.array(z.string()).optional(),
});

type PickRow = StoreProductRow & { pickToken: string; priceDollars: number | null };

function buildPrepLinePickRows(rows: StoreProductRow[]): PickRow[] {
  const out: PickRow[] = [];
  for (const row of rows) {
    const token = (row.variantSku ?? row.internalSku ?? "").trim();
    if (!token) continue;
    out.push({
      ...row,
      pickToken: token,
      priceDollars: row.bestPrice != null && Number.isFinite(row.bestPrice) ? row.bestPrice : null,
    });
  }
  return out;
}

function mapOpenAiToStorefrontResponse(
  ai: z.infer<typeof gloveFinderOpenAiResponseSchema>,
  byPickToken: Map<string, PickRow>
): GloveFinderResponse {
  const recommendations = ai.top_picks.map((pick) => {
    const token = pick.sku.trim();
    const row = byPickToken.get(token);
    const price = row?.priceDollars ?? null;
    return {
      sku: pick.sku,
      name: row?.name ?? pick.sku,
      brand: row?.brandName ?? null,
      reason: pick.reason,
      price,
      catalogProductId: row?.id,
      slug: row?.slug,
      catalogVariantId: row?.catalogVariantId ?? null,
      sizeCode: row?.sizeCode ?? null,
      catalogFacts: row ? projectPrepLineCardFacts(row) : [],
    };
  });

  const summaryParts = [...ai.constraints];
  for (const p of ai.top_picks) {
    if (p.tradeoffs?.length) summaryParts.push(`Tradeoffs: ${p.tradeoffs.join("; ")}`);
  }
  const summary = summaryParts.length ? summaryParts.join(" · ") : null;

  return GloveFinderResponseSchema.parse({
    recommendations,
    summary,
    followUpQuestions: ai.followup_questions,
  });
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

    logPublicFunnel("glove_finder_prep_line", "post", {
      path: request.nextUrl.pathname,
      method: request.method,
    });

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

    if (parsed.data.operationalEnvironmentKey !== RESTAURANT_PREP_LINE_ENVIRONMENT_KEY) {
      return NextResponse.json({ error: "Unsupported operational environment" }, { status: 400 });
    }

    if (!isSupabaseConfigured()) {
      return NextResponse.json({ error: "Catalog unavailable" }, { status: 503 });
    }

    const supabase = getSupabaseAdmin() as any;

    const productIds = await fetchRestaurantPrepLineCandidateProductIds(supabase);
    if (productIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "No catalog products match prep-line evidence (food_safe certification or food_handling use). Enrich catalog attributes before running this flow.",
        },
        { status: 404 }
      );
    }

    const rows = await fetchStoreProductRowsByIds(productIds.slice(0, AI_MAX_CANDIDATES));
    const pickRows = buildPrepLinePickRows(rows);
    if (pickRows.length === 0) {
      return NextResponse.json(
        { error: "Catalog candidates missing variant or internal SKU tokens required for advisory matching." },
        { status: 422 }
      );
    }

    const byPickToken = new Map(pickRows.map((r) => [r.pickToken, r]));
    const candidateList = pickRows
      .map(
        (c) =>
          `- ${c.pickToken}: ${c.name} (brand: ${c.brandName ?? "—"}; material hint: ${c.materialHint ?? "—"}; list price: ${
            c.priceDollars != null ? c.priceDollars.toFixed(2) : "request pricing"
          })`
      )
      .join("\n");

    let gloveThread: { id: string; buyerDisplayRef: string | null } | null = null;
    if (parsed.data.clientTraceId) {
      gloveThread = await ensureGloveFinderOpportunity(supabase, {
        clientTraceId: parsed.data.clientTraceId,
        operationalEnvironmentKey: RESTAURANT_PREP_LINE_ENVIRONMENT_KEY,
      });
      if (!gloveThread) {
        console.error("[glove-finder] procurement opportunity not created (check procurement_opportunities migration)");
      }
    }

    const systemPrompt = [
      "You assist procurement buyers for restaurant prep-line glove selection. Candidates were pre-filtered from the live catalog using governed attributes: food_safe certification OR food_handling use (union). Do not claim additional certifications or regulatory approvals not printed in the candidate line.",
      "Return ONLY valid JSON with this exact shape: { \"constraints\": string[], \"top_picks\": [ { \"sku\": string, \"reason\": string, \"tradeoffs\": string[] } ], \"followup_questions\"?: string[] }.",
      "The sku field MUST exactly match the token after '- ' at the start of a candidate line (before the first colon). Pick at most 3 picks; fewer only if fewer than 3 candidates exist.",
      "Write advisory reasons only: dexterity vs durability tradeoffs, frequent change vs extended wear, wet grip uncertainty without supplier wet-grip data — no 'best', no ranked superlatives, no compliance guarantees.",
    ].join(" ");

    const userPrompt = [
      "Operational environment: restaurant prep line (wet grip intermittent, frequent changes, knife-adjacent tasks possible — buyer must verify cut protection needs separately).",
      "Candidates:",
      candidateList,
      "",
      "User:",
      `Use case label: ${parsed.data.useCaseLabel}`,
      `Material preference: ${parsed.data.materialPreference ?? "not specified"}`,
      `Quantity per month: ${parsed.data.quantityPerMonth ?? "not specified"}`,
      `Constraints: ${parsed.data.constraints ?? "not specified"}`,
      `Hazards: ${parsed.data.hazards.join(", ") || "none"}`,
      `Latex allergy: ${parsed.data.latexAllergy ? "yes" : "no"}`,
    ]
      .filter(Boolean)
      .join("\n");

    const aiResult = await runJsonResponse({
      systemPrompt,
      userPrompt,
      schema: gloveFinderOpenAiResponseSchema,
    });

    const payload = mapOpenAiToStorefrontResponse(aiResult, byPickToken);

    const out = GloveFinderResponseSchema.parse({
      ...payload,
      opportunityId: gloveThread?.id ?? undefined,
      buyerDisplayRef: gloveThread?.buyerDisplayRef ?? undefined,
      advisoryNotice: PrepLineOperationalCopy.staticAdvisoryNotice,
    });

    if (gloveThread?.id) {
      await appendGloveFinderAdvisoryEvent(supabase, gloveThread.id, {
        candidate_count: pickRows.length,
        model: "openai_json",
      });
    }

    return NextResponse.json(out);
  } catch (e) {
    console.error("[glove-finder] Error:", e);
    return NextResponse.json(
      { error: "Prep-line catalog advisory is temporarily unavailable. Please try again." },
      { status: 500 }
    );
  }
}
