/**
 * Extract header + data rows from Excel (.xlsx / .xls) for the same preview/import path as CSV.
 * Uses sheetjs (xlsx); first sheet only.
 */

import * as XLSX from "xlsx";

export interface SpreadsheetExtractResult {
  headers: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  sheetName: string;
}

function normalizeHeader(h: unknown, colIndex: number): string {
  const s = String(h ?? "").trim();
  return s || `col_${colIndex}`;
}

/**
 * Parse workbook buffer (binary) into keyed rows like CSV parse output.
 */
export function rowsFromXlsxBuffer(buf: Buffer): SpreadsheetExtractResult {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetName = wb.SheetNames[0];
  if (!sheetName) {
    return { headers: [], rows: [], rowCount: 0, sheetName: "" };
  }
  const sheet = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown[][];

  if (!aoa.length) {
    return { headers: [], rows: [], rowCount: 0, sheetName };
  }

  const headerRow = (aoa[0] ?? []) as unknown[];
  const headers = headerRow.map((h, i) => normalizeHeader(h, i));

  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < aoa.length; r++) {
    const line = (aoa[r] ?? []) as unknown[];
    const obj: Record<string, unknown> = {};
    let any = false;
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c];
      const v = line[c];
      if (v !== undefined && v !== "" && v != null) any = true;
      obj[key] = v === "" ? undefined : v;
    }
    if (any) rows.push(obj);
  }

  return { headers, rows, rowCount: rows.length, sheetName };
}

export function rowsFromXlsxBase64(b64: string): SpreadsheetExtractResult {
  const buf = Buffer.from(b64, "base64");
  return rowsFromXlsxBuffer(buf);
}

export function isSpreadsheetUpload(filename: string | null | undefined, mimeType: string | null | undefined): boolean {
  const m = (mimeType ?? "").toLowerCase();
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "application/vnd.ms-excel" ||
    m === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  ) {
    return true;
  }
  const f = (filename ?? "").toLowerCase();
  return f.endsWith(".xlsx") || f.endsWith(".xls");
}
