import { normalizeToAllowedValue } from "@/lib/admin/product-attribute-upsert";

const LEGACY_FILTER_METADATA_KEYS = [
  { metaKey: "material", attrKey: "material" },
  { metaKey: "color", attrKey: "color" },
  { metaKey: "mil_thickness", attrKey: "thickness_mil" },
  { metaKey: "mil", attrKey: "thickness_mil" },
] as const;

export type LegacyMetadataField = {
  attrKey: string;
  metaKey: string;
  rawValue: string;
};

export function detectLegacyMetadataFields(
  metadata: Record<string, unknown> | null | undefined,
  currentAttributes: Record<string, string | string[]>
): LegacyMetadataField[] {
  const meta = metadata ?? {};
  const out: LegacyMetadataField[] = [];

  for (const { metaKey, attrKey } of LEGACY_FILTER_METADATA_KEYS) {
    if (currentAttributes[attrKey]) continue;
    const v = meta[metaKey];
    if (typeof v === "string" && v.trim()) {
      if (out.some((x) => x.attrKey === attrKey)) continue;
      out.push({ attrKey, metaKey, rawValue: v.trim() });
    }
  }
  return out;
}

export function legacyMetadataToAttributes(
  fields: LegacyMetadataField[],
  allowedByKey: Map<string, string[]>
): { attributes: Record<string, string | string[]>; skipped: string[] } {
  const attributes: Record<string, string | string[]> = {};
  const skipped: string[] = [];

  for (const f of fields) {
    const allowed = allowedByKey.get(f.attrKey) ?? [];
    if (allowed.length === 0) {
      skipped.push(`${f.attrKey}: no definition`);
      continue;
    }
    const norm = normalizeToAllowedValue(f.rawValue, allowed);
    if (!norm) {
      skipped.push(`${f.attrKey}: "${f.rawValue}" not in dictionary`);
      continue;
    }
    attributes[f.attrKey] = norm;
  }

  return { attributes, skipped };
}
