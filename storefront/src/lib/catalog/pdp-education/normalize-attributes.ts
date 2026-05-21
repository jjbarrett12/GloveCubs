import type { PdpLabeledValue } from "@/lib/catalog/store-product-detail";

export type NormalizedPdpAttributes = Record<string, string[]>;

export function normalizePdpAttributes(specRows: PdpLabeledValue[]): NormalizedPdpAttributes {
  const map: NormalizedPdpAttributes = {};
  for (const row of specRows) {
    const existing = map[row.attribute_key] ?? [];
    if (!existing.includes(row.value)) existing.push(row.value);
    map[row.attribute_key] = existing;
  }
  return map;
}

export function firstAttr(attrs: NormalizedPdpAttributes, key: string): string | null {
  const vals = attrs[key];
  return vals?.[0] ?? null;
}

export function allAttrValues(attrs: NormalizedPdpAttributes, key: string): string[] {
  return attrs[key] ?? [];
}

export function joinAttr(attrs: NormalizedPdpAttributes, key: string): string | null {
  const vals = attrs[key];
  if (!vals?.length) return null;
  return vals.join(", ");
}

export function attrHaystack(attrs: NormalizedPdpAttributes): string {
  return Object.entries(attrs)
    .flatMap(([k, vals]) => vals.map((v) => `${k}:${v}`))
    .join(" ")
    .toLowerCase();
}
