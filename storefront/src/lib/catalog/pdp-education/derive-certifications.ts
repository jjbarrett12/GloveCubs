import type { CertificationCard } from "@/lib/catalog/pdp-education/types";

const CERT_EXPLANATIONS: { match: RegExp; explain: string }[] = [
  {
    match: /ansi.*a([1-9])/i,
    explain: "ANSI/ISEA cut levels describe resistance to sharp materials in published test classes—confirm level on the SKU label.",
  },
  {
    match: /en\s*388|en388/i,
    explain: "EN 388 reports mechanical risks (abrasion, cut, tear, puncture) under European PPE rules—use published matrix values.",
  },
  {
    match: /fda|21\s*cfr|food/i,
    explain: "Food-contact claims must match the exact SKU and intended direct/indirect contact—verify published compliance statements.",
  },
  {
    match: /astm\s*d6319|exam/i,
    explain: "Exam-grade disposables reference medical barrier standards—confirm grade and application on the listing.",
  },
  {
    match: /reach|oeko|ce\b/i,
    explain: "Regulatory marks indicate market compliance frameworks—review documentation for scope and substance restrictions.",
  },
  {
    match: /nfpa|arc/i,
    explain: "Arc or flame ratings are task-specific—match published cal/cm² or category to your electrical safety program.",
  },
];

function explainCert(label: string, value: string): string | null {
  const blob = `${label} ${value}`;
  for (const { match, explain } of CERT_EXPLANATIONS) {
    if (match.test(blob)) return explain;
  }
  return null;
}

export function deriveCertificationCards(
  certificationRows: { label: string; value: string }[],
  specRows: { label: string; value: string; attribute_key: string }[]
): CertificationCard[] {
  const cards: CertificationCard[] = [];
  const seen = new Set<string>();

  const push = (label: string, value: string) => {
    const key = `${label}::${value}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({
      label,
      value,
      explanation: explainCert(label, value),
    });
  };

  for (const row of certificationRows) push(row.label, row.value);

  const certKeys = new Set([
    "certifications",
    "compliance_certifications",
    "grade",
    "sterility",
    "cut_level_ansi",
    "puncture_level",
    "abrasion_level",
    "flame_resistant",
    "arc_rating",
  ]);

  for (const row of specRows) {
    if (certKeys.has(row.attribute_key)) push(row.label, row.value);
  }

  return cards;
}
