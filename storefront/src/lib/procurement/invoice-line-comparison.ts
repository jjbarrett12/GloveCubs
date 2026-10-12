/**
 * Pure invoice-line comparison: identify → compatibility → price → savings gates.
 * No AI. Savings only when equivalency is approved and every gate passes.
 */

import {
  evaluateCompatibility,
  type CompatibilityCheck,
  type GloveSpecSnapshot,
} from "@/lib/procurement/glove-compatibility";
import { resolveGlovesPerPurchasedUnit, type InvoicePackFacts } from "@/lib/procurement/invoice-pack-authority";
import { reconcileInvoiceLinePrice } from "@/lib/procurement/invoice-price-reconcile";
import {
  computeGovernedSavings,
  normalizePricesFromPurchasedUnit,
  type GovernedSavings,
  type SavingsBlockReason,
} from "@/lib/procurement/governed-savings";
import type { EquivalencyStatus, MatchTrustStatus } from "@/lib/procurement/match-trust-status";

export type CompetitorIdentity = {
  id: string;
  manufacturer: string | null;
  brand: string | null;
  sku: string | null;
  upc_gtin: string | null;
  product_name: string | null;
  specs: GloveSpecSnapshot;
  pack: InvoicePackFacts;
  identified_by: "sku" | "upc" | "alias" | "operator";
};

export type EquivalencyRef = {
  id: string;
  status: EquivalencyStatus;
  catalog_product_id: string | null;
  catalog_variant_id: string | null;
};

export type GloveCubsSide = {
  catalog_product_id: string;
  catalog_variant_id: string | null;
  name: string | null;
  sku: string | null;
  specs: GloveSpecSnapshot;
  pack: InvoicePackFacts;
  available_sizes: string[];
  sell_unit_price: number | null;
  sell_gloves_per_unit: number | null;
  pricing_source: string | null;
  /** True only when PA V2 / variant list came from an approved published list. */
  published_list_approved: boolean;
};

export type InvoiceLineComparisonInput = {
  description: string;
  quantity: number;
  unit_price: number | null;
  line_total: number | null;
  sku: string | null;
  pack: InvoicePackFacts;
  specs: GloveSpecSnapshot;
  competitor: CompetitorIdentity | null;
  equivalency: EquivalencyRef | null;
  gloveCubs: GloveCubsSide | null;
  /** CatalogOS fuzzy/attribute hit — candidate only, never savings. */
  catalogos_candidate?: { catalog_product_id: string; match_reason: string } | null;
};

export type InvoiceLineComparison = {
  trust_status: MatchTrustStatus;
  savings: GovernedSavings | null;
  block_reason: SavingsBlockReason | null;
  compatibility: { verdict: string; checks: CompatibilityCheck[] } | null;
  packaging: { status: "verified" | "uom_review_required"; reason?: string };
  price_basis: {
    current_per_1000: number | null;
    glovecubs_per_1000: number | null;
  };
  explain: {
    current: Record<string, unknown>;
    matched_glovecubs: Record<string, unknown> | null;
    match_status: string;
    match_reasons: CompatibilityCheck[];
  };
};

function block(status: MatchTrustStatus, reason: SavingsBlockReason, extra: Partial<InvoiceLineComparison> = {}): InvoiceLineComparison {
  return {
    trust_status: status,
    savings: null,
    block_reason: reason,
    compatibility: extra.compatibility ?? null,
    packaging: extra.packaging ?? { status: "uom_review_required" },
    price_basis: extra.price_basis ?? { current_per_1000: null, glovecubs_per_1000: null },
    explain: extra.explain ?? {
      current: {},
      matched_glovecubs: null,
      match_status: status,
      match_reasons: [],
    },
  };
}

export function evaluateInvoiceLineComparison(input: InvoiceLineComparisonInput): InvoiceLineComparison {
  const currentSpecs: GloveSpecSnapshot = input.competitor?.specs ?? input.specs;
  const currentPack: InvoicePackFacts = {
    quantity_uom: input.pack.quantity_uom ?? input.competitor?.pack.quantity_uom ?? null,
    gloves_per_box: input.pack.gloves_per_box ?? input.competitor?.pack.gloves_per_box ?? null,
    boxes_per_case: input.pack.boxes_per_case ?? input.competitor?.pack.boxes_per_case ?? null,
    gloves_per_case: input.pack.gloves_per_case ?? input.competitor?.pack.gloves_per_case ?? null,
  };

  const explainCurrent = {
    name: input.competitor?.product_name ?? input.description,
    sku: input.competitor?.sku ?? input.sku,
    manufacturer: input.competitor?.manufacturer ?? null,
    ...currentSpecs,
    ...currentPack,
    quantity: input.quantity,
    unit_price: input.unit_price,
  };

  const arith = reconcileInvoiceLinePrice({
    quantity: input.quantity,
    unit_price: input.unit_price,
    line_total: input.line_total,
  });
  if (!arith.ok) {
    return block("price_review_required", "price_arithmetic_conflict", {
      packaging: { status: "verified" },
      explain: { current: explainCurrent, matched_glovecubs: null, match_status: "PRICE_REVIEW_REQUIRED", match_reasons: [] },
    });
  }

  const pack = resolveGlovesPerPurchasedUnit(currentPack);
  if (!pack.ok) {
    return block("uom_review_required", pack.reason === "unknown_quantity_uom" ? "unknown_uom" : "unknown_packaging", {
      packaging: { status: "uom_review_required", reason: pack.reason },
      explain: { current: explainCurrent, matched_glovecubs: null, match_status: "UOM_REVIEW_REQUIRED", match_reasons: [] },
    });
  }

  const currentNorm = normalizePricesFromPurchasedUnit({
    unitPrice: input.unit_price!,
    glovesPerPurchasedUnit: pack.gloves_per_purchased_unit,
    glovesPerCase: pack.gloves_per_case,
  });
  if (!currentNorm.ok) {
    return block("price_review_required", "price_normalization_failed", {
      packaging: { status: "verified" },
      explain: { current: explainCurrent, matched_glovecubs: null, match_status: "PRICE_REVIEW_REQUIRED", match_reasons: [] },
    });
  }

  if (!input.competitor) {
    const status: MatchTrustStatus = input.catalogos_candidate ? "candidate_match" : "unidentified";
    return block(status, "equivalency_not_approved", {
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: input.catalogos_candidate
          ? { catalog_product_id: input.catalogos_candidate.catalog_product_id, note: "fuzzy/attribute candidate only" }
          : null,
        match_status: status === "candidate_match" ? "CANDIDATE" : "INSUFFICIENT DATA",
        match_reasons: [],
      },
    });
  }

  const eq = input.equivalency;
  if (!eq || eq.status === "candidate" || eq.status === "needs_review") {
    return block("candidate_match", "candidate_only_substitute", {
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: eq ? { equivalency_id: eq.id, status: eq.status } : null,
        match_status: "CANDIDATE — review required",
        match_reasons: [],
      },
    });
  }
  if (eq.status === "rejected" || !eq.catalog_product_id) {
    return block("unidentified", "equivalency_not_approved", {
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: null,
        match_status: "INSUFFICIENT DATA",
        match_reasons: [],
      },
    });
  }

  if (!input.gloveCubs) {
    return block("insufficient_data", "missing_authoritative_sell_price", {
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: { catalog_product_id: eq.catalog_product_id },
        match_status: "REVIEW REQUIRED",
        match_reasons: [],
      },
    });
  }

  const compat = evaluateCompatibility({
    current: currentSpecs,
    gloveCubs: input.gloveCubs.specs,
    gloveCubsAvailableSizes: input.gloveCubs.available_sizes,
  });

  const explainGc = {
    name: input.gloveCubs.name,
    sku: input.gloveCubs.sku,
    catalog_product_id: input.gloveCubs.catalog_product_id,
    equivalency_id: eq.id,
    ...input.gloveCubs.specs,
    ...input.gloveCubs.pack,
  };

  if (compat.verdict === "incompatible") {
    const mat = compat.checks.find((c) => c.attribute === "material" && c.blocking);
    const grade = compat.checks.find((c) => c.attribute === "grade" && c.blocking);
    const reason: SavingsBlockReason = mat
      ? "material_incompatible"
      : grade
        ? "grade_incompatible"
        : "compatibility_blocked";
    return block("incompatible", reason, {
      compatibility: compat,
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: explainGc,
        match_status: "INCOMPATIBLE",
        match_reasons: compat.checks,
      },
    });
  }

  if (compat.verdict === "review_required") {
    return block("spec_review_required", "compatibility_blocked", {
      compatibility: compat,
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: explainGc,
        match_status: "REVIEW REQUIRED",
        match_reasons: compat.checks,
      },
    });
  }

  if (input.gloveCubs.sell_unit_price == null || input.gloveCubs.sell_gloves_per_unit == null || !input.gloveCubs.published_list_approved) {
    return block("insufficient_data", "missing_authoritative_sell_price", {
      compatibility: compat,
      packaging: { status: "verified" },
      price_basis: { current_per_1000: currentNorm.prices.per_1000, glovecubs_per_1000: null },
      explain: {
        current: explainCurrent,
        matched_glovecubs: explainGc,
        match_status: "REVIEW REQUIRED",
        match_reasons: compat.checks,
      },
    });
  }

  const gcPack = resolveGlovesPerPurchasedUnit(input.gloveCubs.pack);
  const gcNorm = normalizePricesFromPurchasedUnit({
    unitPrice: input.gloveCubs.sell_unit_price,
    glovesPerPurchasedUnit: input.gloveCubs.sell_gloves_per_unit,
    glovesPerCase: gcPack.ok ? gcPack.gloves_per_case : pack.gloves_per_case,
  });
  if (!gcNorm.ok) {
    return block("price_review_required", "price_normalization_failed", {
      compatibility: compat,
      packaging: { status: "verified" },
      explain: {
        current: explainCurrent,
        matched_glovecubs: explainGc,
        match_status: "PRICE_REVIEW_REQUIRED",
        match_reasons: compat.checks,
      },
    });
  }

  const savings = computeGovernedSavings({
    current: currentNorm.prices,
    glovecubs: gcNorm.prices,
    invoiceQuantity: input.quantity,
    glovesPerPurchasedUnit: pack.gloves_per_purchased_unit,
  });

  const identifiedExact =
    input.competitor.identified_by === "sku" ||
    input.competitor.identified_by === "upc" ||
    input.competitor.identified_by === "operator";
  const trust_status: MatchTrustStatus = "savings_ready";

  return {
    trust_status,
    savings,
    block_reason: null,
    compatibility: compat,
    packaging: { status: "verified" },
    price_basis: {
      current_per_1000: currentNorm.prices.per_1000,
      glovecubs_per_1000: gcNorm.prices.per_1000,
    },
    explain: {
      current: explainCurrent,
      matched_glovecubs: explainGc,
      match_status: identifiedExact ? "VERIFIED / SAVINGS READY" : "HIGH CONFIDENCE / SAVINGS READY",
      match_reasons: compat.checks,
    },
  };
}
