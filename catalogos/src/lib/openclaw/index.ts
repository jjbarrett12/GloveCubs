/**
 * OpenClaw — Glove catalog extraction workflow for GLOVECUBS.
 * Output is import-ready for CatalogOS staging (review, not auto-publish).
 */

export { runOpenClaw, runOpenClawAndExport } from "./run";
export type { OpenClawInput, OpenClawResult } from "./run";
export { discoverProductUrls } from "./discover";
export type { DiscoverInput } from "./discover";
export { fetchAndParsePage, fetchAndParsePages } from "./fetch-parse";
export { extractFromParsedPage } from "./extract";
export { normalizeToOntology } from "./normalize";
export { groupVariants } from "./group";
export { computeRowWarnings } from "./warnings";
export { buildCatalogRow, setGroupKeys } from "./output";
export { rowsToCsv, buildExtractionSummary, summaryToMarkdown } from "./export";
export { safeFetchHtml } from "./fetch";
export { OPENCLAW_CONFIG } from "./config";
export { SITE_FILTER_KEYS } from "./site-filter-ontology";
export * from "./types";
