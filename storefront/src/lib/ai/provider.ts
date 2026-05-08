import type { GloveProduct } from "@/lib/gloves/types";
import {
  GloveFinderResponseSchema,
  type GloveFinderRequest,
  type GloveFinderResponse,
  type InvoiceExtractResponse,
  type InvoiceLine,
  invoiceExtractResponseSchema,
  invoiceRecommendResponseSchema,
  type InvoiceRecommendResponse,
} from "./schemas";
import { chatJsonSimple } from "./openai";
import type { ChatMessage } from "./openai";

const PROVIDER = process.env.AI_PROVIDER ?? "openai";

export type AiGloveFinderResult =
  | { ok: true; data: GloveFinderResponse; usage?: { prompt_tokens: number; completion_tokens: number } }
  | { ok: false; error: string };
export type AiExtractInvoiceResult = { ok: true; data: InvoiceExtractResponse } | { ok: false; error: string };
export type AiInvoiceSavingsResult = { ok: true; data: InvoiceRecommendResponse } | { ok: false; error: string };

function buildGloveFinderMessages(request: GloveFinderRequest, candidates: GloveProduct[]): ChatMessage[] {
  const candidateList = candidates
    .slice(0, 30)
    .map(
      (p) =>
        `- SKU: ${p.sku} | ${p.name} | ${p.material ?? "N/A"} | thickness: ${p.thickness_mil ?? "N/A"}mm | type: ${p.glove_type} | price: $${(p.price_cents / 100).toFixed(2)}`
    )
    .join("\n");
  const userContent = [
    "The user is looking for glove suggestions. Use ONLY the candidate SKUs below.",
    "Candidate SKUs (max 30):",
    candidateList,
    "",
    "User answers:",
    `Use case: ${request.useCaseLabel}`,
    `Material preference: ${request.materialPreference ?? "not specified"}`,
    `Quantity per month: ${request.quantityPerMonth ?? "not specified"}`,
    `Constraints: ${request.constraints ?? "not specified"}`,
    `Hazards: ${request.hazards.length ? request.hazards.join(", ") : "none"}`,
    `Latex allergy: ${request.latexAllergy ? "yes" : "no"}`,
  ].join("\n");
  return [
    {
      role: "system",
      content:
        "You are a glove product expert. Return ONLY JSON: { recommendations: array of { sku, name, brand?, reason, price? (number, dollars) }, summary (string, optional), followUpQuestions (array of strings, optional) }. Only recommend SKUs from the candidate list. Include exactly 3 recommendations when possible. Do not include badges. Do not claim regulatory compliance, food safety, medical grade, powder-free, latex-free, ANSI ratings, or catalog filter matches unless explicitly present in the candidate line.",
    },
    { role: "user", content: userContent },
  ];
}

export async function aiGloveFinder(
  request: GloveFinderRequest,
  candidates: GloveProduct[]
): Promise<AiGloveFinderResult> {
  if (PROVIDER !== "openai") return { ok: false, error: "AI_PROVIDER not supported" };
  if (!candidates.length) return { ok: false, error: "No candidate SKUs" };
  try {
    const { content, usage } = await chatJsonSimple({
      messages: buildGloveFinderMessages(request, candidates),
    });
    const parsed = GloveFinderResponseSchema.parse(content);
    return { ok: true, data: parsed, usage };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse or API error";
    return { ok: false, error: message };
  }
}

export async function aiExtractInvoice(
  imageBase64: string,
  mimeType: string
): Promise<AiExtractInvoiceResult> {
  if (PROVIDER !== "openai") return { ok: false, error: "AI_PROVIDER not supported" };
  try {
    const openai = await import("./openai");
    const mediaType = mimeType.startsWith("image/") ? mimeType : "image/png";
    const messages: ChatMessage[] = [
      {
        role: "system",
        content:
          "Extract line items from this invoice. Return a JSON object with: vendor_name (string or null), invoice_number (string or null), total_amount (number or null), lines (array of { description, quantity, unit_price, total, sku_or_code }). Use numbers for quantity, unit_price, total. If a field is missing use null.",
      },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: `data:${mediaType};base64,${imageBase64}` } },
        ],
      } as ChatMessage,
    ];
    const { content } = await openai.chatJsonSimple({ messages });
    const parsed = invoiceExtractResponseSchema.parse(content);
    return { ok: true, data: parsed };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse or API error";
    return { ok: false, error: message };
  }
}

function buildInvoiceSavingsMessages(lines: InvoiceLine[], catalog: GloveProduct[]): ChatMessage[] {
  const catalogList = catalog
    .slice(0, 50)
    .map(
      (p) =>
        `- ${p.sku} | ${p.name} | $${(p.price_cents / 100).toFixed(2)} | ${p.material ?? ""} | ${p.glove_type}`
    )
    .join("\n");
  const linesText = lines
    .map(
      (l, i) =>
        `[${i}] ${l.description} | qty: ${l.quantity} | unit: ${l.unit_price ?? "?"} | total: ${l.total ?? "?"} | code: ${l.sku_or_code ?? "?"}`
    )
    .join("\n");
  return [
    {
      role: "system",
      content: `You match invoice line items to our catalog and suggest cheaper or better alternatives. Catalog (SKU, name, price, material, type):\n${catalogList}\n\nReturn JSON: total_current_estimate (sum of line totals), total_recommended_estimate (sum of your recommended prices), estimated_savings, swaps (array of { line_index, current_description, recommended_sku, recommended_name, brand?, estimated_savings?, reason, confidence 0-1 }). Only include swaps where you found a match.`,
    },
    {
      role: "user",
      content: `Invoice lines:\n${linesText}`,
    },
  ];
}

export async function aiInvoiceSavings(
  lines: InvoiceLine[],
  catalog: GloveProduct[]
): Promise<AiInvoiceSavingsResult> {
  if (PROVIDER !== "openai") return { ok: false, error: "AI_PROVIDER not supported" };
  if (!lines.length) return { ok: false, error: "No lines" };
  try {
    const { content } = await chatJsonSimple({
      messages: buildInvoiceSavingsMessages(lines, catalog),
    });
    const parsed = invoiceRecommendResponseSchema.parse(content);
    return { ok: true, data: parsed };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Parse or API error";
    return { ok: false, error: message };
  }
}

export { chatCompletionPlain, OPENAI_CHAT_MODEL, getOpenAIClient } from "./openai";
