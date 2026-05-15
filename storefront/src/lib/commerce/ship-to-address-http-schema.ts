import { z } from "zod";

export function shipToAddressUuidParam(id: string | undefined): string | null {
  if (!id || !z.string().uuid().safeParse(id).success) return null;
  return id;
}

/** POST body — matches Phase 1A admin ship-to create (non-strict for admin backward compatibility). */
export const shipToAddressPostBodySchema = z.object({
  label: z.string().trim().max(200).optional().nullable(),
  recipient_name: z.string().trim().min(1).max(500),
  company_name: z.string().trim().max(500).optional().nullable(),
  address_line_1: z.string().trim().min(1).max(500),
  address_line_2: z.string().trim().max(500).optional().nullable(),
  city: z.string().trim().min(1).max(200),
  region: z.string().trim().min(1).max(200),
  postal_code: z.string().trim().min(1).max(32),
  country_code: z.string().trim().length(2).optional(),
  phone: z.string().trim().max(50).optional().nullable(),
  delivery_notes: z.string().trim().max(500).optional().nullable(),
  is_archived: z.boolean().optional(),
});

/** Buyer POST: reject unknown keys (e.g. `company_id`) so the client cannot smuggle scope. */
export const shipToAddressBuyerPostBodySchema = shipToAddressPostBodySchema.strict();

export const shipToAddressPatchBodySchema = z
  .object({
    label: z.string().trim().max(200).optional().nullable(),
    recipient_name: z.string().trim().min(1).max(500).optional(),
    company_name: z.string().trim().max(500).optional().nullable(),
    address_line_1: z.string().trim().min(1).max(500).optional(),
    address_line_2: z.string().trim().max(500).optional().nullable(),
    city: z.string().trim().min(1).max(200).optional(),
    region: z.string().trim().min(1).max(200).optional(),
    postal_code: z.string().trim().min(1).max(32).optional(),
    country_code: z.string().trim().length(2).optional(),
    phone: z.string().trim().max(50).optional().nullable(),
    delivery_notes: z.string().trim().max(500).optional().nullable(),
    is_archived: z.boolean().optional(),
  })
  .strict();
