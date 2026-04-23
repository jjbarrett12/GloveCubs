/**
 * OpenClaw: Full pipeline — discover → fetch/parse → extract → normalize → group → warnings → output → export.
 */

import { discoverProductUrls } from "./discover";
import { fetchAndParsePages } from "./fetch-parse";
import { extractFromParsedPage } from "./extract";
import { normalizeToOntology } from "./normalize";
import { groupVariants } from "./group";
import { computeRowWarnings } from "./warnings";
import { buildCatalogRow } from "./output";
import {
  rowsToCsv,
  buildExtractionSummary,
  summaryToMarkdown,
} from "./export";
import { SITE_FILTER_KEYS } from "./site-filter-ontology";
import type { GloveCatalogRow, ExtractionSummary } from "./types";

const MAPPED_SPEC_KEYS = new Set([
  "material", "size", "color", "thickness", "thickness_mil", "powder", "sterile", "sterility",
  "box qty", "case qty", "box_qty", "case_qty", "texture", "cuff", "brand", "grade", "category",
]);

function buildExtractionNotesFromSpec(specTable: Record<string, string> | undefined): string {
  if (!specTable || !Object.keys(specTable).length) return "";
  const unmapped: string[] = [];
  for (const key of Object.keys(specTable)) {
    const k = key.toLowerCase().replace(/\s+/g, " ");
    const isMapped = [...SITE_FILTER_KEYS].some((f) => k.includes(f.replace(/_/g, " ")) || k.includes(f));
    if (!isMapped && !MAPPED_SPEC_KEYS.has(k)) unmapped.push(`${key}=${specTable[key]}`);
  }
  return unmapped.length ? `Unmapped specs: ${unmapped.join("; ")}` : "";
}

export interface OpenClawInput {
  /** Category/collection URL or base for discovery. */
  root_url: string;
  /** Optional: skip discovery and use these product URLs. */
  product_urls?: string[];
  /** Optional: max product URLs to discover (default from config). */
  max_urls?: number;
}

export interface OpenClawResult {
  rows: GloveCatalogRow[];
  summary: ExtractionSummary;
  product_url_list: { source_root_url: string; discovered: { discovered_product_url: string }[] };
}

function sourceSupplierFromUrl(rootUrl: string): string {
  try {
    return new URL(rootUrl).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

/**
 * Run the full OpenClaw pipeline. Does NOT auto-publish; output is for CatalogOS staging/import.
 */
export async function runOpenClaw(input: OpenClawInput): Promise<OpenClawResult> {
  const sourceSupplier = sourceSupplierFromUrl(input.root_url);

  const urlList = await discoverProductUrls({
    root_url: input.root_url,
    product_urls: input.product_urls,
    max_urls: input.max_urls,
  });

  const urls = urlList.discovered.map((d) => d.discovered_product_url);
  const parsedPages = await fetchAndParsePages(urls);

  const allRows: GloveCatalogRow[] = [];
  for (let i = 0; i < parsedPages.length; i++) {
    const { url, parsed } = parsedPages[i];
    if (!parsed) continue;
    const categoryPath = urlList.discovered[i]?.category_path ?? "";
    const extracted = extractFromParsedPage(parsed, sourceSupplier, categoryPath);
    const normalized = normalizeToOntology(extracted);
    const variantInput = { parsed, normalized, sourceSupplier, sourceCategoryPath: categoryPath };
    const variantRows = groupVariants(variantInput);

    for (const vr of variantRows) {
      const normVariant = normalizeToOntology(vr.extracted);
      const warnings = computeRowWarnings(normVariant);
      const extractionNotes = buildExtractionNotesFromSpec(parsed.spec_table);
      const row = buildCatalogRow(normVariant, warnings, {
        raw_title: parsed.product_title ?? undefined,
        raw_description: parsed.description ?? undefined,
        raw_specs_json: parsed.spec_table ? JSON.stringify(parsed.spec_table) : undefined,
        extraction_notes: extractionNotes || undefined,
        family_group_key: vr.family_group_key,
        variant_group_key: vr.variant_group_key,
      });
      allRows.push(row);
    }
  }

  const summary = buildExtractionSummary(
    input.root_url,
    allRows,
    urlList.discovered.length,
    parsedPages.filter((p) => p.parsed != null).length
  );

  return {
    rows: allRows,
    summary,
    product_url_list: {
      source_root_url: urlList.source_root_url,
      discovered: urlList.discovered.map((d) => ({ discovered_product_url: d.discovered_product_url })),
    },
  };
}

/**
 * Run pipeline and write CSV, JSON, and extraction_summary.md to the given directory.
 */
export async function runOpenClawAndExport(
  input: OpenClawInput,
  outputDir: string
): Promise<{ csvPath: string; jsonPath: string; summaryPath: string; result: OpenClawResult }> {
  const result = await runOpenClaw(input);
  const path = await import("path");
  const fs = await import("fs/promises");

  const csvPath = path.join(outputDir, "glove_catalog_rows.csv");
  const jsonPath = path.join(outputDir, "glove_catalog_rows.json");
  const summaryPath = path.join(outputDir, "extraction_summary.md");

  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(csvPath, rowsToCsv(result.rows), "utf-8");
  await fs.writeFile(jsonPath, JSON.stringify(result.rows, null, 2), "utf-8");
  await fs.writeFile(summaryPath, summaryToMarkdown(result.summary), "utf-8");

  return { csvPath, jsonPath, summaryPath, result };
}
