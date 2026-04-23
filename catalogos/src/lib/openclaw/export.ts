/**
 * OpenClaw Step 8: Export glove_catalog_rows.csv, .json, extraction_summary.md.
 */

import type { GloveCatalogRow, ExtractionSummary } from "./types";
import { OPENCLAW_CONFIG } from "./config";

const CSV_HEADERS = [
  "source_url",
  "family_name",
  "variant_name",
  "sku",
  "brand",
  "material",
  "glove_type",
  "size",
  "color",
  "thickness_mil",
  "powder_status",
  "sterile_status",
  "box_qty",
  "case_qty",
  "texture",
  "cuff_style",
  "category",
  "overall_confidence",
  "needs_review",
  "warning_messages",
  "raw_title",
  "raw_description",
  "raw_specs_json",
  "extraction_notes",
  "family_group_key",
  "variant_group_key",
  "field_extraction",
];

function escapeCsv(val: string): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(rows: GloveCatalogRow[]): string {
  const lines: string[] = [CSV_HEADERS.join(",")];
  for (const r of rows) {
    const cells = CSV_HEADERS.map((h) => {
      const v = (r as unknown as Record<string, unknown>)[h];
      if (h === "field_extraction" && v != null && typeof v === "object") return escapeCsv(JSON.stringify(v));
      return escapeCsv(String(v ?? ""));
    });
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}

export function buildExtractionSummary(
  rootUrl: string,
  rows: GloveCatalogRow[],
  productUrlsDiscovered: number,
  productPagesParsed: number
): ExtractionSummary {
  const highConf = rows.filter((r) => r.overall_confidence >= OPENCLAW_CONFIG.high_confidence_threshold).length;
  const needsReview = rows.filter((r) => r.needs_review).length;
  const codeCounts = new Map<string, number>();
  for (const r of rows) {
    for (const msg of (r.warning_messages || "").split(" | ").filter(Boolean)) {
      const code = msg.length > 40 ? msg.slice(0, 40) : msg;
      codeCounts.set(code, (codeCounts.get(code) ?? 0) + 1);
    }
  }
  const topWarningCategories = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, count }));

  const duplicateRiskObservations: string[] = [];
  const skuSet = new Set<string>();
  for (const r of rows) {
    if (r.sku && skuSet.has(r.sku)) duplicateRiskObservations.push(`Duplicate SKU: ${r.sku}`);
    if (r.sku) skuSet.add(r.sku);
  }

  const normalizationIssues: string[] = [];
  const emptyMaterials = rows.filter((r) => !r.material?.trim()).length;
  if (emptyMaterials > 0) normalizationIssues.push(`${emptyMaterials} rows with empty material`);
  const emptySizes = rows.filter((r) => !r.size?.trim()).length;
  if (emptySizes > 0) normalizationIssues.push(`${emptySizes} rows with empty size`);

  return {
    root_url: rootUrl,
    total_product_urls_discovered: productUrlsDiscovered,
    total_product_pages_parsed: productPagesParsed,
    total_variant_rows_created: rows.length,
    total_high_confidence_rows: highConf,
    total_needs_review_rows: needsReview,
    top_warning_categories: topWarningCategories,
    duplicate_risk_observations: duplicateRiskObservations,
    normalization_issues_found: normalizationIssues,
    generated_at: new Date().toISOString(),
  };
}

export function summaryToMarkdown(summary: ExtractionSummary): string {
  const lines: string[] = [
    "# OpenClaw Extraction Summary",
    "",
    `- **Root URL:** ${summary.root_url}`,
    `- **Product URLs discovered:** ${summary.total_product_urls_discovered}`,
    `- **Product pages parsed:** ${summary.total_product_pages_parsed}`,
    `- **Variant rows created:** ${summary.total_variant_rows_created}`,
    `- **High-confidence rows (≥0.90):** ${summary.total_high_confidence_rows}`,
    `- **Needs review:** ${summary.total_needs_review_rows}`,
    "",
    "## Top warning categories",
    "",
  ];
  for (const { code, count } of summary.top_warning_categories) {
    lines.push(`- ${code}: ${count}`);
  }
  lines.push("", "## Duplicate risk observations", "");
  for (const obs of summary.duplicate_risk_observations) {
    lines.push(`- ${obs}`);
  }
  if (summary.duplicate_risk_observations.length === 0) lines.push("- None");
  lines.push("", "## Normalization issues", "");
  for (const issue of summary.normalization_issues_found) {
    lines.push(`- ${issue}`);
  }
  if (summary.normalization_issues_found.length === 0) lines.push("- None");
  lines.push("", `*Generated: ${summary.generated_at}*`);
  return lines.join("\n");
}
