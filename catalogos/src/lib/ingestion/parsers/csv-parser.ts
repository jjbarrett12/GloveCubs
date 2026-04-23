/**
 * CSV parser: first row = headers, subsequent rows = records.
 * Handles quoted fields and common delimiters (comma, tab).
 */

import type { ParsedRow, ParserResult } from "../types";

const DEFAULT_DELIMITER = ",";

/**
 * Parse CSV string into array of record objects.
 * Example input:
 *   "sku,name,price\nGLV-1,Nitrile Gloves,12.99\nGLV-2,Vinyl Gloves,8.99"
 * Example output:
 *   [ { sku: "GLV-1", name: "Nitrile Gloves", price: "12.99" }, ... ]
 */
export function parseCsv(csvBody: string, delimiter = DEFAULT_DELIMITER): ParserResult {
  const lines = csvBody.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { rows: [], format: "csv", rowCount: 0 };
  }

  const headerLine = lines[0];
  const headers = parseCsvLine(headerLine, delimiter);
  const rows: ParsedRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i], delimiter);
    const record: ParsedRow = {};
    headers.forEach((h, j) => {
      const key = String(h).trim();
      const value = values[j] !== undefined ? String(values[j]).trim() : "";
      record[key] = value === "" ? undefined : coerceValue(value);
    });
    rows.push(record);
  }

  return { rows, format: "csv", rowCount: rows.length };
}

/** Parse a single CSV line respecting quoted fields. */
function parseCsvLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (inQuotes) {
      current += c;
    } else if (c === delimiter) {
      result.push(current);
      current = "";
    } else {
      current += c;
    }
  }
  result.push(current);
  return result;
}

/** Coerce string to number when it looks like one. */
function coerceValue(s: string): unknown {
  const t = s.trim();
  if (t === "" || t.toLowerCase() === "null") return undefined;
  const n = Number(t);
  if (!Number.isNaN(n) && t !== "") return n;
  if (t.toLowerCase() === "true") return true;
  if (t.toLowerCase() === "false") return false;
  return t;
}
