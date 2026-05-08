import { z } from "zod";

/** Full governance PATCH — changes review_status / catalog ids / operator decision fields. */
export const governInvoiceLinePatchSchema = z.object({
  decision: z.enum(["approve", "reject", "no_match", "assign"]),
  catalog_product_id: z.string().uuid().optional().nullable(),
  review_notes: z.string().max(2000).optional().nullable(),
  resolution_reason: z.string().max(200).optional().nullable(),
});

/** Audit text only — must not accept decision keys (operators should not confuse with governance). */
export const notesOnlyInvoiceLinePatchSchema = z
  .object({
    review_notes: z.string().max(2000),
  })
  .strict();
