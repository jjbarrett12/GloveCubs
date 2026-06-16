import type { SellUnit, UnitNoun } from "@commerce-packaging/types";
import type { PdpCommercePackaging } from "@/lib/catalog/store-product-commerce";
import type { QuoteCartItem } from "@/lib/quote-cart/types";
import { resolveQuoteSellUnit } from "@/lib/quote-cart/line-utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function computeCommerceTotals(
  sellUnit: SellUnit,
  quantity: number,
  pkg: Pick<
    PdpCommercePackaging,
    "unitsPerCase" | "casesPerPallet" | "unitsPerPallet"
  >
): { totalCases: number | null; totalUnits: number | null; totalPallets: number | null } {
  const q = Math.max(1, Math.floor(quantity));
  if (sellUnit === "pallet") {
    const casesPerPallet = pkg.casesPerPallet;
    const totalCases = casesPerPallet != null ? q * casesPerPallet : null;
    const totalUnits =
      pkg.unitsPerPallet != null
        ? q * pkg.unitsPerPallet
        : totalCases != null && pkg.unitsPerCase != null
          ? totalCases * pkg.unitsPerCase
          : null;
    return { totalCases, totalUnits, totalPallets: q };
  }
  const totalUnits = pkg.unitsPerCase != null ? q * pkg.unitsPerCase : null;
  return { totalCases: q, totalUnits, totalPallets: null };
}

export function buildCommerceSummary(
  sellUnit: SellUnit,
  quantity: number,
  pkg: Pick<
    PdpCommercePackaging,
    "unitsPerCase" | "casesPerPallet" | "unitsPerPallet" | "unitNoun"
  >
): string {
  const q = Math.max(1, Math.floor(quantity));
  const { totalCases, totalUnits, totalPallets } = computeCommerceTotals(sellUnit, q, pkg);
  const noun = pkg.unitNoun;

  if (sellUnit === "pallet") {
    const parts = [`${q} pallet${q === 1 ? "" : "s"}`];
    if (totalCases != null) parts.push(`${totalCases.toLocaleString("en-US")} cases`);
    if (totalUnits != null) parts.push(`${totalUnits.toLocaleString("en-US")} ${noun} total`);
    return parts.join(" · ");
  }

  const parts = [`${q} case${q === 1 ? "" : "s"}`];
  if (totalUnits != null) parts.push(`${totalUnits.toLocaleString("en-US")} ${noun} total`);
  return parts.join(" · ");
}

export function buildQuoteLineCommerceFields(
  sellUnit: SellUnit,
  quantity: number,
  pkg: PdpCommercePackaging,
  unitPriceOverride?: number | null
): Pick<
  QuoteCartItem,
  | "sell_unit"
  | "unit_price_major"
  | "units_per_case"
  | "cases_per_pallet"
  | "units_per_pallet"
  | "unit_noun"
  | "commerce_summary"
  | "line_unit_label"
> {
  const unitPrice =
    unitPriceOverride ??
    (sellUnit === "pallet" ? pkg.palletPrice : pkg.casePrice);
  return {
    sell_unit: sellUnit,
    unit_price_major: unitPrice,
    units_per_case: pkg.unitsPerCase,
    cases_per_pallet: sellUnit === "pallet" ? pkg.casesPerPallet : null,
    units_per_pallet: sellUnit === "pallet" ? pkg.unitsPerPallet : null,
    unit_noun: pkg.unitNoun,
    commerce_summary: buildCommerceSummary(sellUnit, quantity, pkg),
    line_unit_label: sellUnit,
  };
}

export function formatQuoteCartLinePrimary(item: QuoteCartItem): string | null {
  const sellUnit = resolveQuoteSellUnit(item.sell_unit);
  const qty = item.quantity;
  const price = item.unit_price_major;
  const unitLabel = sellUnit === "pallet" ? "pallet" : "case";
  const qtyLabel = `${qty} ${unitLabel}${qty === 1 ? "" : "s"}`;
  if (price != null && Number.isFinite(price) && price > 0) {
    return `${qtyLabel} × ${usd.format(price)} / ${unitLabel}`;
  }
  return qtyLabel;
}

export function formatQuoteCartLineSecondary(item: QuoteCartItem): string | null {
  const sellUnit = resolveQuoteSellUnit(item.sell_unit);
  const noun = item.unit_noun ?? "units";
  const pkg = {
    unitsPerCase: item.units_per_case ?? null,
    casesPerPallet: item.cases_per_pallet ?? null,
    unitsPerPallet: item.units_per_pallet ?? null,
    unitNoun: noun as UnitNoun,
  };
  const { totalCases, totalUnits } = computeCommerceTotals(sellUnit, item.quantity, pkg);

  if (sellUnit === "pallet") {
    if (totalCases != null && totalUnits != null) {
      return `${totalCases.toLocaleString("en-US")} cases / ${totalUnits.toLocaleString("en-US")} ${noun} total`;
    }
    if (totalUnits != null) return `${totalUnits.toLocaleString("en-US")} ${noun} total`;
    return item.commerce_summary ?? null;
  }

  if (totalUnits != null) return `${totalUnits.toLocaleString("en-US")} ${noun} total`;
  return item.commerce_summary ?? null;
}
