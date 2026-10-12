/**
 * Customer-safe invoice comparison DTO.
 * Never consume raw comparison_snapshot or invoice_lines internals in customer UI.
 */

import type { InvoiceLineComparison } from "@/lib/procurement/invoice-line-comparison";
import type { CompatibilityCheck } from "@/lib/procurement/glove-compatibility";

/** Presentation-only. Does not change governed math. */
export const CUSTOMER_SAVINGS_PROMOTION_MIN_PER_1000_USD = 1;

export const CUSTOMER_INVOICE_COMPARISON_STATUSES = [
  "savings_ready",
  "verified_match_no_savings",
  "reviewing",
  "insufficient_information",
  "no_match",
] as const;

export type CustomerInvoiceComparisonStatus = (typeof CUSTOMER_INVOICE_COMPARISON_STATUSES)[number];

export const CUSTOMER_INVOICE_COMPARISON_LINE_KEYS = [
  "line_id",
  "status",
  "customer_message",
  "customer_product",
  "recommendation",
  "savings",
  "why_this_matches",
] as const;

export type CustomerSafeMatchReason = {
  attribute: string;
  result: "MATCH" | "DIFFERENT" | "MISSING";
  detail: string | null;
};

export type CustomerInvoiceProduct = {
  description: string;
  recognized_name: string | null;
  size: string | null;
  material: string | null;
  thickness_mil: number | null;
  packaging_summary: string | null;
  current_price_per_1000: number | null;
};

export type CustomerGloveCubsRecommendation = {
  catalog_product_id: string;
  catalog_variant_id: string | null;
  slug: string;
  name: string;
  size: string | null;
  material: string | null;
  grade: string | null;
  thickness_mil: number | null;
  color: string | null;
  packaging_summary: string | null;
  sell_price_per_1000: number;
};

export type CustomerPromotedSavings = {
  dollar_savings_per_1000: number;
  percent_savings: number;
  invoice_dollar_savings: number | null;
};

export type CustomerInvoiceComparisonLine = {
  line_id: string;
  status: CustomerInvoiceComparisonStatus;
  customer_message: string;
  customer_product: CustomerInvoiceProduct;
  recommendation: CustomerGloveCubsRecommendation | null;
  savings: CustomerPromotedSavings | null;
  why_this_matches: CustomerSafeMatchReason[];
};

export type CustomerInvoiceComparison = {
  invoice: {
    vendor: string | null;
    invoice_number: string | null;
    invoice_date: string | null;
  };
  lines: CustomerInvoiceComparisonLine[];
};

export type CustomerProductAvailability = {
  catalog_product_id: string;
  catalog_variant_id: string | null;
  slug: string;
  name: string;
  status: string;
  variant_is_active: boolean;
  size_code: string | null;
};

const FORBIDDEN_CUSTOMER_DTO_TOKENS = [
  "cost",
  "supplier_cost",
  "import_cost",
  "margin",
  "prompt",
  "openai",
  "approved_by",
  "operator",
  "evidence",
  "review_notes",
  "human_decided_by",
  "match_confidence",
  "field_provenance",
  "comparison_snapshot",
];

export const CUSTOMER_STATUS_MESSAGES: Record<CustomerInvoiceComparisonStatus, string> = {
  savings_ready: "A verified GloveCubs alternative is available at a lower normalized price.",
  verified_match_no_savings:
    "We found a verified GloveCubs equivalent. It is not presented as a savings opportunity.",
  reviewing: "We identified this item and are verifying the best GloveCubs alternative.",
  insufficient_information: "We need more packaging or pricing information to compare this product accurately.",
  no_match: "We do not currently have a verified GloveCubs match for this product.",
};

function roundUsd2(n: number): number {
  return Math.round(n * 100) / 100;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function packagingSummary(pack: Record<string, unknown> | null | undefined): string | null {
  if (!pack) return null;
  const uom = str(pack.quantity_uom);
  const perBox = num(pack.gloves_per_box);
  const boxes = num(pack.boxes_per_case);
  const parts: string[] = [];
  if (perBox) parts.push(`${perBox}/box`);
  if (boxes) parts.push(`${boxes} boxes/case`);
  if (uom) parts.unshift(uom);
  return parts.length ? parts.join(" · ") : null;
}

function customerMatchReasons(checks: CompatibilityCheck[] | undefined): CustomerSafeMatchReason[] {
  return (checks ?? [])
    .filter((c) => c.attribute !== "internal")
    .map((c) => ({
      attribute: c.attribute,
      result: c.result,
      detail: c.note ?? (c.result === "DIFFERENT" && c.attribute === "color" ? "Color is preference, not a functional mismatch" : null),
    }));
}

function productSellable(p: CustomerProductAvailability | null): boolean {
  if (!p) return false;
  if (p.status !== "active") return false;
  if (!p.slug?.trim() || !p.name?.trim()) return false;
  if (p.catalog_variant_id && !p.variant_is_active) return false;
  return true;
}

function mapInternalStatus(
  comparison: InvoiceLineComparison,
): Exclude<CustomerInvoiceComparisonStatus, "verified_match_no_savings"> {
  const t = comparison.trust_status;
  if (t === "unidentified" || t === "incompatible") return "no_match";
  if (t === "uom_review_required" || t === "price_review_required" || t === "insufficient_data") {
    return "insufficient_information";
  }
  if (t === "candidate_match" || t === "spec_review_required") return "reviewing";
  if (t === "savings_ready" || t === "verified" || t === "high_confidence") return "savings_ready";
  return "reviewing";
}

export function toCustomerInvoiceComparisonLine(input: {
  line_id: string;
  description: string;
  comparison: InvoiceLineComparison;
  product: CustomerProductAvailability | null;
  promotionMinPer1000?: number;
}): CustomerInvoiceComparisonLine {
  const min = input.promotionMinPer1000 ?? CUSTOMER_SAVINGS_PROMOTION_MIN_PER_1000_USD;
  const current = (input.comparison.explain.current ?? {}) as Record<string, unknown>;
  const gc = (input.comparison.explain.matched_glovecubs ?? null) as Record<string, unknown> | null;
  const why = customerMatchReasons(input.comparison.explain.match_reasons);

  const customer_product: CustomerInvoiceProduct = {
    description: input.description,
    recognized_name: str(current.name) ?? str(current.product_name),
    size: str(current.size),
    material: str(current.material),
    thickness_mil: num(current.thickness_mil),
    packaging_summary: packagingSummary(current),
    current_price_per_1000:
      input.comparison.price_basis.current_per_1000 != null
        ? roundUsd2(input.comparison.price_basis.current_per_1000)
        : null,
  };

  const mapped = mapInternalStatus(input.comparison);
  const savingsRaw = input.comparison.savings;
  const block = input.comparison.block_reason;
  const sellable = productSellable(input.product);

  const incompatible =
    input.comparison.trust_status === "incompatible" ||
    block === "material_incompatible" ||
    block === "grade_incompatible";
  const candidate = block === "candidate_only_substitute" || input.comparison.trust_status === "candidate_match";

  if (incompatible) {
    return {
      line_id: input.line_id,
      status: "no_match",
      customer_message: CUSTOMER_STATUS_MESSAGES.no_match,
      customer_product,
      recommendation: null,
      savings: null,
      why_this_matches: why,
    };
  }

  if (block === "unknown_uom" || block === "unknown_packaging") {
    return {
      line_id: input.line_id,
      status: "insufficient_information",
      customer_message: CUSTOMER_STATUS_MESSAGES.insufficient_information,
      customer_product,
      recommendation: null,
      savings: null,
      why_this_matches: [],
    };
  }

  if (candidate || mapped === "reviewing") {
    return {
      line_id: input.line_id,
      status: "reviewing",
      customer_message: CUSTOMER_STATUS_MESSAGES.reviewing,
      customer_product,
      recommendation: null,
      savings: null,
      why_this_matches: [],
    };
  }

  if (mapped !== "savings_ready" || !savingsRaw || !sellable || !input.product) {
    const status: CustomerInvoiceComparisonStatus =
      mapped === "insufficient_information" ? "insufficient_information" : "no_match";
    return {
      line_id: input.line_id,
      status,
      customer_message: CUSTOMER_STATUS_MESSAGES[status],
      customer_product,
      recommendation: null,
      savings: null,
      why_this_matches: [],
    };
  }

  const per1000 = savingsRaw.dollar_savings_per_1000;
  const recommendation: CustomerGloveCubsRecommendation = {
    catalog_product_id: input.product.catalog_product_id,
    catalog_variant_id: input.product.catalog_variant_id,
    slug: input.product.slug,
    name: input.product.name,
    size: input.product.size_code ?? str(gc?.size) ?? null,
    material: str(gc?.material),
    grade: str(gc?.grade),
    thickness_mil: num(gc?.thickness_mil),
    color: str(gc?.color),
    packaging_summary: packagingSummary(gc),
    sell_price_per_1000: roundUsd2(input.comparison.price_basis.glovecubs_per_1000 ?? savingsRaw.glovecubs.per_1000),
  };

  if (!(per1000 > 0) || per1000 < min) {
    return {
      line_id: input.line_id,
      status: "verified_match_no_savings",
      customer_message: CUSTOMER_STATUS_MESSAGES.verified_match_no_savings,
      customer_product,
      recommendation,
      savings: null,
      why_this_matches: why,
    };
  }

  return {
    line_id: input.line_id,
    status: "savings_ready",
    customer_message: CUSTOMER_STATUS_MESSAGES.savings_ready,
    customer_product,
    recommendation,
    savings: {
      dollar_savings_per_1000: roundUsd2(savingsRaw.dollar_savings_per_1000),
      percent_savings: roundUsd2(savingsRaw.percent_savings),
      invoice_dollar_savings:
        savingsRaw.invoice_dollar_savings != null ? roundUsd2(savingsRaw.invoice_dollar_savings) : null,
    },
    why_this_matches: why,
  };
}

export function toCustomerInvoiceComparison(input: {
  vendor: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  lines: Array<{
    line_id: string;
    description: string;
    comparison: InvoiceLineComparison;
    product: CustomerProductAvailability | null;
  }>;
  promotionMinPer1000?: number;
}): CustomerInvoiceComparison {
  return {
    invoice: {
      vendor: input.vendor,
      invoice_number: input.invoice_number,
      invoice_date: input.invoice_date,
    },
    lines: input.lines.map((ln) =>
      toCustomerInvoiceComparisonLine({
        line_id: ln.line_id,
        description: ln.description,
        comparison: ln.comparison,
        product: ln.product,
        promotionMinPer1000: input.promotionMinPer1000,
      }),
    ),
  };
}

export function customerDtoContainsForbiddenField(payload: unknown): boolean {
  const json = JSON.stringify(payload).toLowerCase();
  return FORBIDDEN_CUSTOMER_DTO_TOKENS.some((tok) => json.includes(`"${tok}":`));
}

export function assertCustomerInvoiceComparisonLineShape(dto: CustomerInvoiceComparisonLine): void {
  const extra = Object.keys(dto).filter(
    (k) => !CUSTOMER_INVOICE_COMPARISON_LINE_KEYS.includes(k as (typeof CUSTOMER_INVOICE_COMPARISON_LINE_KEYS)[number]),
  );
  if (extra.length) throw new Error(`customer_invoice_comparison_leak:${extra.join(",")}`);
}

