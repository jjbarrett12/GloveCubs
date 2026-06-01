/**
 * Legacy promote-path glove attribute upsert (material, thickness, powder, grade only).
 * Full editor and promote PA truth uses product-attribute-sync + attributesFromImportDraft.
 */

import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import type { ImportDraftProductV1 } from "@/lib/admin/import-draft-types";

export type AttributeUpsertResult = {
  synced: number;
  errors: string[];
};

type RawAttributeCandidates = {
  material?: string;
  thickness_mil?: number;
  powder?: boolean | null;
  exam_grade?: boolean | null;
  glove_grade?: string | null;
};

/** Normalize a raw value to an allowed dictionary value_text (case/underscore/hyphen insensitive). */
export function normalizeToAllowedValue(
  raw: string | number | boolean,
  allowedValues: string[]
): string | null {
  if (allowedValues.length === 0) return null;

  const norm = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .replace(/[\s_-]+/g, "_");

  const rawNorm =
    typeof raw === "boolean"
      ? raw
        ? "true"
        : "false"
      : norm(String(raw));

  for (const allowed of allowedValues) {
    if (norm(allowed) === rawNorm) return allowed;
  }

  // Synonym / partial matching
  for (const allowed of allowedValues) {
    const a = norm(allowed);
    if (rawNorm.includes(a) || a.includes(rawNorm)) return allowed;
  }

  if (rawNorm === "true" || rawNorm === "powder_free" || rawNorm === "powderfree") {
    const pf = allowedValues.find((v) => norm(v) === "powder_free");
    if (pf) return pf;
  }

  if (rawNorm === "exam" || rawNorm === "medical_exam" || rawNorm.includes("exam")) {
    const exam = allowedValues.find((v) => norm(v).includes("exam"));
    if (exam) return exam;
  }

  return null;
}

export function resolveGovernanceAttributeValues(
  draft: ImportDraftProductV1,
  allowedByKey: Map<string, string[]>
): Map<string, string> {
  const out = new Map<string, string>();
  const candidates: RawAttributeCandidates = {
    material: draft.material ?? undefined,
    thickness_mil: draft.thickness_mil ?? undefined,
    powder: draft.powder_free,
    exam_grade: draft.exam_grade,
    glove_grade: draft.glove_grade,
  };

  if (candidates.material) {
    const allowed = allowedByKey.get("material") ?? [];
    const v = normalizeToAllowedValue(candidates.material, allowed);
    if (v) out.set("material", v);
  }

  if (candidates.thickness_mil != null && Number.isFinite(candidates.thickness_mil)) {
    const allowed = allowedByKey.get("thickness_mil") ?? [];
    const v = normalizeToAllowedValue(String(candidates.thickness_mil), allowed);
    if (v) out.set("thickness_mil", v);
  }

  if (candidates.powder === true) {
    const allowed = allowedByKey.get("powder") ?? [];
    const v = normalizeToAllowedValue("powder_free", allowed);
    if (v) out.set("powder", v);
  }

  if (candidates.exam_grade === true || candidates.glove_grade) {
    const allowed = allowedByKey.get("grade") ?? [];
    const raw = candidates.glove_grade ?? "medical_exam_grade";
    const v = normalizeToAllowedValue(raw, allowed);
    if (v) out.set("grade", v);
  }

  return out;
}

async function getAttributeDefinitionsWithAllowed(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  categoryId: string,
  attributeKeys: string[]
): Promise<{ defIds: Map<string, string>; allowedByKey: Map<string, string[]> }> {
  const defIds = new Map<string, string>();
  const allowedByKey = new Map<string, string[]>();
  if (attributeKeys.length === 0) return { defIds, allowedByKey };

  const { data: defs, error } = await (supabase as any)
    .schema("catalogos")
    .from("attribute_definitions")
    .select("id, attribute_key")
    .eq("category_id", categoryId)
    .in("attribute_key", attributeKeys);

  if (error || !defs?.length) return { defIds, allowedByKey };

  const idList: string[] = [];
  for (const row of defs as { id: string; attribute_key: string }[]) {
    defIds.set(row.attribute_key, row.id);
    idList.push(row.id);
    allowedByKey.set(row.attribute_key, []);
  }

  const { data: allowedRows } = await (supabase as any)
    .schema("catalogos")
    .from("attribute_allowed_values")
    .select("attribute_definition_id, value_text, sort_order")
    .in("attribute_definition_id", idList)
    .order("sort_order", { ascending: true });

  const idToKey = new Map<string, string>();
  for (const row of defs as { id: string; attribute_key: string }[]) {
    idToKey.set(row.id, row.attribute_key);
  }

  for (const row of (allowedRows ?? []) as {
    attribute_definition_id: string;
    value_text: string;
  }[]) {
    const key = idToKey.get(row.attribute_definition_id);
    if (!key) continue;
    const arr = allowedByKey.get(key) ?? [];
    arr.push(row.value_text);
    allowedByKey.set(key, arr);
  }

  return { defIds, allowedByKey };
}

/**
 * Upsert import-derived glove attributes. Never throws; does not block promote.
 */
export async function upsertImportDraftGloveAttributes(
  productId: string,
  categoryId: string,
  draft: ImportDraftProductV1
): Promise<AttributeUpsertResult> {
  if (!isSupabaseConfigured() || !categoryId.trim()) {
    return { synced: 0, errors: [] };
  }

  const keys = ["material", "thickness_mil", "powder", "grade"];

  try {
    const supabase = getSupabaseAdmin();
    const { defIds, allowedByKey } = await getAttributeDefinitionsWithAllowed(
      supabase,
      categoryId,
      keys
    );
    const resolved = resolveGovernanceAttributeValues(draft, allowedByKey);
    const errors: string[] = [];
    let synced = 0;

    for (const key of keys) {
      const valueText = resolved.get(key);
      if (!valueText) {
        if (
          (key === "material" && draft.material) ||
          (key === "thickness_mil" && draft.thickness_mil != null) ||
          (key === "powder" && draft.powder_free === true) ||
          (key === "grade" && draft.exam_grade === true)
        ) {
          errors.push(`${key}: no compatible allowed value`);
        }
        continue;
      }

      const attrDefId = defIds.get(key);
      if (!attrDefId) {
        errors.push(`No attribute_definition for category + ${key}`);
        continue;
      }

      const { error: delErr } = await (supabase as any)
        .schema("catalogos")
        .from("product_attributes")
        .delete()
        .eq("product_id", productId)
        .eq("attribute_definition_id", attrDefId);
      if (delErr) {
        errors.push(`${key}: delete ${delErr.message}`);
        continue;
      }

      const { error: insErr } = await (supabase as any).schema("catalogos").from("product_attributes").insert({
        product_id: productId,
        attribute_definition_id: attrDefId,
        value_text: valueText,
        value_number: null,
        value_boolean: null,
      });
      if (insErr) {
        errors.push(`${key}: insert ${insErr.message}`);
        continue;
      }
      synced++;
    }

    if (errors.length > 0) {
      console.warn("[import-attribute-upsert] partial failure", { productId, errors });
    }
    return { synced, errors };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[import-attribute-upsert] failed", { productId, msg });
    return { synced: 0, errors: [msg] };
  }
}
