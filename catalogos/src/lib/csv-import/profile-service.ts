/**
 * Import profile CRUD and lookup by fingerprint for reuse.
 */

import { getSupabaseCatalogos } from "@/lib/db/client";
import type { FieldMappingItem } from "./types";

export function sourceFingerprint(headers: string[], supplierId: string | null): string {
  const normalized = headers.slice().sort().map((h) => h.trim().toLowerCase()).join("|");
  const prefix = supplierId ? `${supplierId}:` : "";
  return prefix + normalized;
}

/**
 * Find an existing profile by fingerprint (optional supplier). Returns null if none.
 */
export async function findProfileByFingerprint(
  fingerprint: string,
  supplierId?: string | null
): Promise<{ profileId: string; fields: FieldMappingItem[] } | null> {
  const supabase = getSupabaseCatalogos(true);
  let query = supabase
    .from("import_profiles")
    .select("id")
    .eq("source_fingerprint", fingerprint)
    .eq("status", "active")
    .limit(1);
  if (supplierId != null) query = query.eq("supplier_id", supplierId);
  const { data: profile } = await query.maybeSingle();
  if (!profile?.id) return null;

  const { data: fields } = await supabase
    .from("import_profile_fields")
    .select("source_column_name, mapped_field_name, confidence, notes")
    .eq("import_profile_id", profile.id);
  const list = (fields ?? []) as Array<{
    source_column_name: string;
    mapped_field_name: string;
    confidence: number;
    notes: string | null;
  }>;
  return {
    profileId: profile.id as string,
    fields: list.map((f) => ({
      source_column: f.source_column_name,
      mapped_field: f.mapped_field_name,
      confidence: f.confidence,
      notes: f.notes ?? undefined,
    })),
  };
}

/**
 * Save a new profile or update existing (by fingerprint). Upserts profile and fields.
 */
export async function saveProfile(
  params: {
    supplierId: string | null;
    profileName: string;
    fingerprint: string;
    averageConfidence: number;
    fields: FieldMappingItem[];
  }
): Promise<string> {
  const supabase = getSupabaseCatalogos(true);
  const { data: existing } = await supabase
    .from("import_profiles")
    .select("id")
    .eq("source_fingerprint", params.fingerprint)
    .limit(1)
    .maybeSingle();

  let profileId: string;
  if (existing?.id) {
    profileId = existing.id as string;
    await supabase
      .from("import_profiles")
      .update({
        profile_name: params.profileName,
        average_confidence: params.averageConfidence,
        updated_at: new Date().toISOString(),
      })
      .eq("id", profileId);
    await supabase.from("import_profile_fields").delete().eq("import_profile_id", profileId);
  } else {
    const { data: inserted, error } = await supabase
      .from("import_profiles")
      .insert({
        supplier_id: params.supplierId,
        profile_name: params.profileName,
        source_fingerprint: params.fingerprint,
        status: "active",
        average_confidence: params.averageConfidence,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    profileId = (inserted as { id: string }).id;
  }

  if (params.fields.length > 0) {
    const rows = params.fields.map((f) => ({
      import_profile_id: profileId,
      source_column_name: f.source_column,
      mapped_field_name: f.mapped_field,
      transform_type: "copy",
      confidence: f.confidence,
      notes: f.notes ?? null,
    }));
    await supabase.from("import_profile_fields").insert(rows);
  }
  return profileId;
}
