import { z } from "zod";

const quoteLineItemSchema = z.object({
  productId: z.string().uuid(),
  canonicalProductId: z.string().uuid().optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().min(1).max(100_000),
  notes: z.string().max(2000).optional().default(""),
});

export const submitQuoteRequestSchema = z.object({
  company_name: z.string().min(1, "Company name required").max(500),
  contact_name: z.string().min(1, "Contact name required").max(200),
  email: z.string().email("Valid email required"),
  phone: z.string().max(50).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  urgency: z.enum(["standard", "urgent", "asap"]).optional().nullable(),
  items: z.array(quoteLineItemSchema).min(1, "At least one item required").max(100),
  idempotency_key: z.string().max(128).optional(),
});

export type SubmitQuoteRequestInput = z.infer<typeof submitQuoteRequestSchema>;
