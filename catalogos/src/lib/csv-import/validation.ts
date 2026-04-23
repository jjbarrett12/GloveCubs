/**
 * Validation for standardized CSV rows. No AI; rules only.
 */

import type { ValidationSummary } from "./types";
import type { ParsedRow } from "@/lib/ingestion/types";

const THICKNESS_MIL_MIN = 1;
const THICKNESS_MIL_MAX = 30;
const REASONABLE_PRICE_MAX = 1_000_000;
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string {
  if (v == null) return "";
  return String(v).trim();
}

/**
 * Validate a single standardized row. Returns list of error messages (empty if valid).
 */
export function validateStandardizedRow(
  row: ParsedRow,
  rowIndex: number
): string[] {
  const errors: string[] = [];
  const name = str(row.name ?? row.product_name ?? row.title);
  const sku = str(row.sku ?? row.supplier_sku ?? row.item ?? row.item_number ?? row.id);
  const cost = num(row.cost ?? row.price ?? row.case_price ?? row.supplier_cost);

  if (!name && !sku) {
    errors.push("Missing both name/title and sku/identifier");
  }
  if (cost != null && (cost < 0 || cost > REASONABLE_PRICE_MAX)) {
    errors.push(`Price/cost out of range: ${cost}`);
  }
  const casePrice = num(row.case_price);
  if (casePrice != null && (casePrice < 0 || casePrice > REASONABLE_PRICE_MAX)) {
    errors.push(`case_price out of range: ${casePrice}`);
  }
  const thickness = num(row.thickness_mil);
  if (thickness != null && (thickness < THICKNESS_MIL_MIN || thickness > THICKNESS_MIL_MAX)) {
    errors.push(`thickness_mil must be ${THICKNESS_MIL_MIN}-${THICKNESS_MIL_MAX}`);
  }
  const glovesPerBox = num(row.gloves_per_box);
  if (glovesPerBox != null && (glovesPerBox < 0 || glovesPerBox > 100000)) {
    errors.push("gloves_per_box out of reasonable range");
  }
  const boxesPerCase = num(row.boxes_per_case);
  if (boxesPerCase != null && (boxesPerCase < 0 || boxesPerCase > 10000)) {
    errors.push("boxes_per_case out of reasonable range");
  }
  const img = row.image_url ?? row.image;
  if (img != null && typeof img === "string" && img.trim() && !URL_PATTERN.test(img.trim())) {
    errors.push("image_url is not a valid URL");
  }

  return errors;
}

/**
 * Validate multiple rows and build ValidationSummary.
 */
export function validateStandardizedRows(rows: ParsedRow[]): ValidationSummary {
  const row_errors: { row_index: number; messages: string[] }[] = [];
  const allErrors: string[] = [];
  let invalid_count = 0;

  for (let i = 0; i < rows.length; i++) {
    const messages = validateStandardizedRow(rows[i], i);
    if (messages.length > 0) {
      invalid_count++;
      row_errors.push({ row_index: i, messages });
      allErrors.push(...messages.slice(0, 3));
    }
  }

  const valid_count = rows.length - invalid_count;
  const uniqueErrors = [...new Set(allErrors)].slice(0, 20);

  return {
    valid_count,
    invalid_count,
    errors: uniqueErrors,
    row_errors,
  };
}
