/**
 * Shared validation for admin commerce mutations (offers, product IDs).
 */

import { z } from "zod";

export type OfferAdminPatchInput = {
  cost?: number;
  sell_price?: number | null;
  lead_time_days?: number | null;
  is_active?: boolean;
};

export function validateUuidParam(label: string, value: string): string | null {
  const r = z.string().uuid().safeParse(value);
  return r.success ? null : `Invalid ${label}`;
}

/**
 * Validate optional numeric fields for supplier offer admin updates.
 */
export function validateOfferAdminPatch(
  fields: OfferAdminPatchInput
): { ok: true } | { ok: false; error: string } {
  if (fields.cost !== undefined) {
    if (!Number.isFinite(fields.cost) || fields.cost < 0) return { ok: false, error: "Invalid cost" };
  }
  if (fields.sell_price !== undefined && fields.sell_price != null) {
    if (!Number.isFinite(fields.sell_price) || fields.sell_price < 0) {
      return { ok: false, error: "Invalid sell_price" };
    }
  }
  if (fields.lead_time_days !== undefined && fields.lead_time_days != null) {
    if (!Number.isInteger(fields.lead_time_days) || fields.lead_time_days < 0) {
      return { ok: false, error: "Invalid lead_time_days" };
    }
  }
  return { ok: true };
}
