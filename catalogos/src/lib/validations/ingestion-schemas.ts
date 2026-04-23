import { z } from "zod";

/** Trigger import: by feed_id (uses feed URL from DB) or by supplier_id + feed_url. */
export const triggerImportSchema = z.object({
  feed_id: z.string().uuid().optional(),
  supplier_id: z.string().uuid().optional(),
  feed_url: z.string().url().optional(),
  /** When true, returns 202 with batchId and runs ingestion in the background (Vercel waitUntil when available). */
  async: z.boolean().optional(),
  /** Rows per bulk insert chunk (default from ingestion-config). */
  chunk_size: z.number().int().min(50).max(500).optional(),
}).refine(
  (data) => (data.feed_id != null) || (data.supplier_id != null && data.feed_url != null),
  { message: "Either feed_id or both supplier_id and feed_url are required" }
);

export type TriggerImportInput = z.infer<typeof triggerImportSchema>;

/** Parsed row from CSV/JSON: flexible record. */
export const parsedRowSchema = z.record(z.unknown());

/** Parser result. */
export const parserResultSchema = z.object({
  rows: z.array(parsedRowSchema),
  format: z.enum(["csv", "json", "jsonl"]),
  rowCount: z.number().int().min(0),
});

/** Glove attributes (extracted). */
export const gloveAttributesSchema = z.object({
  material: z.enum(["nitrile", "vinyl", "latex", "neoprene", "poly"]).optional(),
  color: z.enum(["blue", "black", "white", "clear", "green", "orange"]).optional(),
  size: z.enum(["XS", "S", "M", "L", "XL", "XXL"]).optional(),
  thickness_mil: z.number().min(0).optional(),
  powder_free: z.boolean().optional(),
  latex_free: z.boolean().optional(),
  case_qty: z.number().int().min(1).optional(),
  product_type: z.literal("disposable_gloves").optional(),
}).strict();
