"use client";

import type { SellUnit } from "@commerce-packaging/types";
import type { PdpCommercePackaging } from "@/lib/catalog/store-product-commerce";
import { formatUnitsPerCaseLine, pricingForSellUnit } from "@/lib/catalog/store-product-commerce";
import { CommercePriceLine } from "@/components/store/CommercePriceLine";
import { buildCommerceSummary, computeCommerceTotals } from "@/lib/quote-cart/commerce-line";
import { cn } from "@/lib/utils";

type Props = {
  commerce: PdpCommercePackaging;
  sellUnit: SellUnit;
  onSellUnitChange: (unit: SellUnit) => void;
  quantity: number;
  onQuantityChange: (qty: number) => void;
  compact?: boolean;
};

export function PdpSellUnitToggle({
  commerce,
  sellUnit,
  onSellUnitChange,
  quantity,
  onQuantityChange,
  compact,
}: Props) {
  const q = Math.max(1, Math.floor(quantity));
  const unitPricing = pricingForSellUnit(commerce, sellUnit);
  const unitPrice = unitPricing.effectivePrice;
  const { totalCases, totalUnits } = computeCommerceTotals(sellUnit, q, commerce);
  const unitsPerCaseLine = formatUnitsPerCaseLine(commerce.unitsPerCase, commerce.unitNoun);
  const summary = buildCommerceSummary(sellUnit, q, commerce);

  return (
    <div
      className={cn(
        "space-y-3",
        compact ? "" : "rounded-lg border border-white/10 bg-[#141414] px-3 py-3"
      )}
    >
      <div className="flex gap-2">
        <SellUnitButton
          label="Case"
          selected={sellUnit === "case"}
          disabled={!commerce.sellByCaseEnabled}
          onClick={() => onSellUnitChange("case")}
        />
        <SellUnitButton
          label="Pallet"
          selected={sellUnit === "pallet"}
          disabled={!commerce.palletBuyingEnabled}
          title={!commerce.palletBuyingEnabled ? "Pallet pricing unavailable" : undefined}
          onClick={() => onSellUnitChange("pallet")}
        />
      </div>
      {!commerce.palletBuyingEnabled && commerce.sellByPalletEnabled ? (
        <p className="text-[10px] text-white/45">Pallet pricing unavailable for this product.</p>
      ) : null}

      <div className="flex items-center gap-2">
        <label htmlFor="pdp-qty" className="text-[11px] font-semibold text-white/55">
          Quantity
        </label>
        <input
          id="pdp-qty"
          type="number"
          min={1}
          max={99999}
          value={q}
          onChange={(e) => onQuantityChange(Number(e.target.value))}
          className="h-9 w-20 rounded-md border border-white/15 bg-white/5 px-2 text-sm tabular-nums text-white"
        />
        <span className="text-[11px] text-white/50">{sellUnit === "pallet" ? "pallets" : "cases"}</span>
      </div>

      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">
          {sellUnit === "pallet" ? "Pallet pricing" : "Case pricing"}
        </p>
        {unitPrice != null ? (
          <CommercePriceLine
            listPrice={unitPricing.listPrice}
            salePrice={unitPricing.salePrice}
            onSale={unitPricing.onSale}
            unitLabel={sellUnit}
            compact={compact}
          />
        ) : (
          <p className="text-[12px] font-medium text-white/45">Request pricing for this {sellUnit}</p>
        )}
        <p className="text-[11px] font-medium text-white/65">{summary}</p>
        {sellUnit === "case" && unitsPerCaseLine ? (
          <p className="text-[11px] text-white/50">{unitsPerCaseLine}</p>
        ) : null}
        {sellUnit === "pallet" && commerce.casesPerPallet != null ? (
          <p className="text-[11px] text-white/50">
            {commerce.casesPerPallet.toLocaleString("en-US")} cases per pallet
          </p>
        ) : null}
        {sellUnit === "case" && commerce.caseLabel ? (
          <p className="text-[10px] leading-snug text-white/40">{commerce.caseLabel}</p>
        ) : null}
        {sellUnit === "pallet" && commerce.palletLabel ? (
          <p className="text-[10px] leading-snug text-white/40">{commerce.palletLabel}</p>
        ) : null}
        {sellUnit === "pallet" && totalCases != null && totalUnits != null ? (
          <p className="text-[10px] text-white/45">
            {totalCases.toLocaleString("en-US")} cases · {totalUnits.toLocaleString("en-US")}{" "}
            {commerce.unitNoun} total
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SellUnitButton({
  label,
  selected,
  disabled,
  title,
  onClick,
}: {
  label: string;
  selected: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={cn(
        "flex-1 rounded-lg border px-3 py-2 text-xs font-bold uppercase tracking-wide transition",
        selected
          ? "border-[var(--color-accent-orange)] bg-[var(--color-accent-orange)]/15 text-white"
          : "border-white/15 text-white/70 hover:border-white/30",
        disabled && "cursor-not-allowed opacity-40 hover:border-white/15"
      )}
    >
      {label}
    </button>
  );
}
