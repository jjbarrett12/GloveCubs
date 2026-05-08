import { RESTAURANT_PREP_LINE_ENVIRONMENT_KEY } from "@/lib/ontology/operational-environments";

export type PrepLineChecklistId =
  | "wet_hands"
  | "frequent_changes"
  | "knife_adjacent"
  | "grease_exposure"
  | "fast_don_doff"
  | "extended_wear"
  | "color_coding";

export type PrepLineChecklistItem = {
  id: PrepLineChecklistId;
  label: string;
  /** Static caution key — maps to copy in cautionRails */
  cautionKey: string;
};

export const PREP_LINE_CHECKLIST_ITEMS: PrepLineChecklistItem[] = [
  { id: "wet_hands", label: "Wet or greasy hands intermittently", cautionKey: "wet_hands" },
  { id: "frequent_changes", label: "Very frequent glove changes", cautionKey: "frequent_changes" },
  { id: "knife_adjacent", label: "Knife-adjacent prep work", cautionKey: "knife_adjacent" },
  { id: "grease_exposure", label: "Light grease / oil contact", cautionKey: "grease_exposure" },
  { id: "fast_don_doff", label: "Fast don / doff matters", cautionKey: "fast_don_doff" },
  { id: "extended_wear", label: "Extended wear per pair", cautionKey: "extended_wear" },
  { id: "color_coding", label: "Color-coding or allergen program", cautionKey: "color_coding" },
];

export const PREP_LINE_ENVIRONMENT_HEADER = {
  title: "Restaurant prep line (operational pilot)",
  body: `Operational environment: ${RESTAURANT_PREP_LINE_ENVIRONMENT_KEY}. Use this flow to shortlist catalog-backed disposable gloves for food-contact prep. Critical compliance and HACCP/SQF decisions remain your responsibility — use the product page and your food safety program.`,
} as const;

const cautionRails: Record<string, string> = {
  wet_hands:
    "Wet grip varies by SKU. If water or oil is frequent, confirm texture and supplier guidance on the product page.",
  frequent_changes:
    "High change rates increase cost-per-shift. Compare case economics and donning ease on the product page.",
  knife_adjacent:
    "Knife-adjacent tasks may require cut protection not covered by this shortlist. Confirm cut protection on the product page when required.",
  grease_exposure:
    "Light grease is not heavy industrial exposure. For aggressive degreasers, validate chemical compatibility on SDS/TDS.",
  fast_don_doff:
    "Don/doff speed depends on cuff, texture, and sizing consistency — verify variant fit on the product page.",
  extended_wear:
    "Comfort and durability trade off with thickness. Do not assume extended wear without supplier documentation.",
  color_coding:
    "Color programs are operational policy. Confirm SKU color and allergen program fit with your standard operating procedures.",
};

export function getPrepLineCautionLines(selectedIds: Set<PrepLineChecklistId>): string[] {
  const keys = new Set<string>();
  for (const item of PREP_LINE_CHECKLIST_ITEMS) {
    if (selectedIds.has(item.id)) keys.add(item.cautionKey);
  }
  return Array.from(keys)
    .map((k) => cautionRails[k])
    .filter(Boolean);
}
