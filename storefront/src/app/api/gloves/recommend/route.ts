import { NextRequest, NextResponse } from "next/server";
import { recommendRequestSchema, recommendResponseSchema, type RecommendResponse } from "@/lib/gloves/types";
import { createServerSupabase } from "@/lib/supabase/server";
import {
  getActiveProducts,
  getUseCaseRiskProfiles,
  logRecoSession,
  prefilterProductsForRecommend,
} from "@/lib/gloves/queries";
import { scoreGloves, topNWithAlternatives } from "@/lib/gloves/scoring";
import type { ScoredProduct } from "@/lib/gloves/scoring";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

function formatRulesResponse(
  scored: ScoredProduct[],
  topN: number = 9
): RecommendResponse {
  const { top, cheaper, moreDurable, moreProtection } = topNWithAlternatives(scored, topN);
  const maxScore = Math.max(...top.map((t) => t.total), 1);
  return recommendResponseSchema.parse({
    recommendations: top.slice(0, 10).map((t, i) => ({
      sku: t.product.sku,
      score_0_100: Math.round(Math.min(100, Math.max(0, (t.total / maxScore) * 80 + 20))),
      reason: `Matches your use case and risk profile (score: ${t.total}). ${t.product.material ?? "Material"} ${t.product.glove_type}, ${t.product.name}.`,
      best_for: i < 3 ? "Best match" : undefined,
      tradeoffs: t.product.price_cents ? `$${(t.product.price_cents / 100).toFixed(2)}` : undefined,
      name: t.product.name,
      price_cents: t.product.price_cents,
      glove_type: t.product.glove_type,
    })),
    alternatives: [
      { type: "cheaper", skus: cheaper.slice(0, 3).map((p) => p.sku) },
      { type: "more_durable", skus: moreDurable.slice(0, 3).map((p) => p.sku) },
      { type: "more_protection", skus: moreProtection.slice(0, 3).map((p) => p.sku) },
    ],
    clarifying_questions: [],
    confidence_0_1: 0.85,
    model_used: "rules",
    score_breakdown: top.slice(0, 10).map((t) => ({
      sku: t.product.sku,
      total: t.total,
      breakdown: t.breakdown,
    })),
  });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = recommendRequestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: "VALIDATION_ERROR", message: parsed.error.message } },
        { status: 400 }
      );
    }
    const { useCaseKey, answers } = parsed.data;

    const supabase = createServerSupabase();
    const [products, riskProfiles] = await Promise.all([
      getActiveProducts(supabase),
      getUseCaseRiskProfiles(supabase, useCaseKey),
    ]);

    const filtered = prefilterProductsForRecommend(products, useCaseKey, answers);
    const risksWithSeverity = riskProfiles.map((r) => ({ risk: r.risk, severity: r.severity }));
    const scored = scoreGloves(filtered, risksWithSeverity, answers);

    let result: RecommendResponse;

    if (OPENAI_API_KEY && scored.length > 0) {
      try {
        const productSummary = scored.slice(0, 50).map(
          (s) =>
            `SKU: ${s.product.sku} | ${s.product.name} | ${s.product.glove_type} | ${s.product.material ?? "n/a"} | food_safe:${s.product.food_safe} | medical:${s.product.medical_grade} | cut:${s.product.cut_level ?? "n/a"} | score:${s.total}`
        ).join("\n");
        const prompt = `You are a glove recommendation assistant. Given the use case "${useCaseKey}" and user answers, rank the following gloves and return JSON only.
User answers: ${JSON.stringify(answers)}
Products (pre-scored):
${productSummary}

Return exactly this JSON structure (no markdown):
{"recommendations":[{"sku":"...","score_0_100":0-100,"reason":"...","best_for":"...","tradeoffs":"..."}],"alternatives":[{"type":"cheaper","skus":["sku1"]},{"type":"more_durable","skus":["sku1"]},{"type":"more_protection","skus":["sku1"]}],"clarifying_questions":[],"confidence_0_1":0.0-1.0}`;

        const res = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${OPENAI_API_KEY}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [{ role: "user", content: prompt }],
            temperature: 0.2,
          }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const content = data.choices?.[0]?.message?.content?.trim() ?? "";
        const jsonStr = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
        const aiRaw = JSON.parse(jsonStr) as unknown;
        const parsed = recommendResponseSchema.safeParse(aiRaw);
        if (!parsed.success) {
          result = formatRulesResponse(scored);
        } else {
          result = {
            recommendations: parsed.data.recommendations,
            alternatives: parsed.data.alternatives ?? [],
            clarifying_questions: parsed.data.clarifying_questions ?? [],
            confidence_0_1: parsed.data.confidence_0_1,
            model_used: "openai",
            score_breakdown: undefined,
          } as RecommendResponse;
        }
      } catch {
        result = formatRulesResponse(scored);
      }
    } else {
      result = formatRulesResponse(scored);
    }

    await logRecoSession(supabase, {
      use_case_key: useCaseKey,
      answers: answers as unknown as Record<string, unknown>,
      result: result as unknown as Record<string, unknown>,
      model_used: result.model_used ?? "rules",
    }).catch(() => {});

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json(
      { error: { code: "INTERNAL_ERROR", message } },
      { status: 500 }
    );
  }
}
