/**
 * JSON parser: accepts array of objects or JSONL (newline-delimited JSON).
 */

import type { ParsedRow, ParserResult } from "../types";

/**
 * Parse JSON body: either a single array of objects or JSONL lines.
 * Example array input:  [ { "sku": "GLV-1", "name": "Gloves" }, ... ]
 * Example JSONL input:  { "sku": "GLV-1" }\n{ "sku": "GLV-2" }
 */
export function parseJson(body: string): ParserResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return { rows: [], format: "json", rowCount: 0 };
  }

  // Try single JSON array first
  if (trimmed.startsWith("[")) {
    const arr = JSON.parse(trimmed) as unknown[];
    if (!Array.isArray(arr)) {
      throw new Error("JSON root is not an array");
    }
    const rows = arr.map((item) => (item && typeof item === "object" ? (item as ParsedRow) : {}));
    return { rows, format: "json", rowCount: rows.length };
  }

  // JSONL: one JSON object per line
  const lines = trimmed.split(/\r?\n/).filter((l) => l.trim());
  const rows: ParsedRow[] = [];
  const skippedLines: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    try {
      const obj = JSON.parse(line) as unknown;
      rows.push(obj && typeof obj === "object" ? (obj as ParsedRow) : {});
    } catch {
      // Track skipped lines for observability
      skippedLines.push(i + 1);
    }
  }
  // Log malformed lines if any were skipped (important for data integrity auditing)
  if (skippedLines.length > 0) {
    console.warn(`[CatalogOS] JSONL parser skipped ${skippedLines.length} malformed lines: ${skippedLines.slice(0, 10).join(", ")}${skippedLines.length > 10 ? "..." : ""}`);
  }
  return { rows, format: "jsonl", rowCount: rows.length, skippedLineCount: skippedLines.length };
}
