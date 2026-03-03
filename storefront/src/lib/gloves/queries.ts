import type { ServerSupabase } from "@/lib/supabase/server";
import type { GloveProduct, GloveUseCase, GloveRiskProfile, GloveUseCaseRisk } from "./types";
import { gloveProductSchema, useCaseSchema, riskProfileSchema } from "./types";
import {
  getCachedUseCases,
  setCachedUseCases,
  getCachedRiskProfiles,
  setCachedRiskProfiles,
} from "./cache";

export async function getUseCases(supabase: ServerSupabase): Promise<GloveUseCase[]> {
  const cached = getCachedUseCases<GloveUseCase>();
  if (cached?.length) return cached;
  const { data, error } = await supabase
    .from("glove_use_cases")
    .select("*")
    .order("sort", { ascending: true });
  if (error) throw error;
  const result = (data ?? []).map((row: Record<string, unknown>) =>
    useCaseSchema.parse({ ...(row as object), id: String(row.id) })
  );
  setCachedUseCases(result);
  return result;
}

export async function getActiveProducts(supabase: ServerSupabase): Promise<GloveProduct[]> {
  const { data, error } = await supabase
    .from("glove_products")
    .select("*")
    .eq("active", true);
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) =>
    gloveProductSchema.parse({
      ...(row as object),
      id: String(row.id),
      chemical_resistance: typeof row.chemical_resistance === "object" && row.chemical_resistance ? row.chemical_resistance : {},
    })
  );
}

export async function getUseCaseRiskProfiles(
  supabase: ServerSupabase,
  useCaseKey: string
): Promise<{ risk: GloveRiskProfile; severity: number }[]> {
  const cached = getCachedRiskProfiles(useCaseKey) as
    | { risk: GloveRiskProfile; severity: number }[]
    | null;
  if (cached?.length) return cached;

  const { data: ucData } = await supabase
    .from("glove_use_cases")
    .select("id")
    .eq("key", useCaseKey)
    .single();
  const useCaseId = (ucData as { id?: string } | null)?.id ?? null;
  if (!useCaseId) return [];

  const { data: linksData, error: linkErr } = await supabase
    .from("glove_use_case_risks")
    .select("risk_profile_id, severity")
    .eq("use_case_id", useCaseId);
  if (linkErr || !linksData?.length) return [];
  const links = linksData as { risk_profile_id: string; severity: number }[];

  const riskIds = links.map((l) => l.risk_profile_id);
  const { data: risksData, error: riskErr } = await supabase
    .from("glove_risk_profiles")
    .select("*")
    .in("id", riskIds);
  if (riskErr || !risksData?.length) return [];
  const risks = risksData as Record<string, unknown>[];

  const byId = new Map(risks.map((r) => [String(r.id), r]));
  const weights = (r: Record<string, unknown>) =>
    typeof r.weights === "object" && r.weights !== null ? (r.weights as Record<string, number>) : {};
  const result = links
    .filter((l) => byId.has(l.risk_profile_id))
    .map((l) => {
      const r = byId.get(l.risk_profile_id)!;
      return {
        risk: riskProfileSchema.parse({
          ...r,
          id: String(r.id),
          weights: typeof r.weights === "object" && r.weights !== null ? (r.weights as Record<string, number>) : {},
        }),
        severity: l.severity,
      };
    });
  setCachedRiskProfiles(useCaseKey, result);
  return result;
}

/**
 * Pre-filter products by glove_type (from answers) and use-case-relevant attributes
 * so we do not score or send the entire catalog to the model.
 */
export function prefilterProductsForRecommend(
  products: GloveProduct[],
  useCaseKey: string,
  answers: { gloveTypePreference?: "disposable" | "reusable" | "either" }
): GloveProduct[] {
  let out = products;
  if (answers.gloveTypePreference && answers.gloveTypePreference !== "either") {
    out = out.filter((p) => p.glove_type === answers.gloveTypePreference);
  }
  const useCaseAttr: Record<string, (p: GloveProduct) => boolean> = {
    food_preparation: (p) => p.food_safe === true,
    patient_care_exams: (p) => p.medical_grade === true,
    chemical_handling: (p) =>
      typeof p.chemical_resistance === "object" &&
      p.chemical_resistance !== null &&
      Object.keys(p.chemical_resistance as Record<string, unknown>).length > 0,
    cold_weather_work: (p) => !!p.cold_rating,
    high_volume_disposable: (p) => p.glove_type === "disposable",
  };
  const attrFilter = useCaseAttr[useCaseKey];
  if (attrFilter) {
    const filtered = out.filter(attrFilter);
    if (filtered.length > 0) out = filtered;
  }
  return out.length > 500 ? out.slice(0, 500) : out;
}

export async function logRecoSession(
  supabase: ServerSupabase,
  payload: {
    use_case_key: string | null;
    answers: unknown;
    result: unknown;
    model_used: string | null;
  }
): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from("glove_reco_sessions").insert({
    use_case_key: payload.use_case_key,
    answers: payload.answers as Record<string, unknown>,
    result: payload.result as Record<string, unknown>,
    model_used: payload.model_used,
  });
}
