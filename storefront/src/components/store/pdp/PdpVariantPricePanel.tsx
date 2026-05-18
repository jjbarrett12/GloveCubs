import Link from "next/link";
import type { PdpParentFromDisplay, PdpSelectedVariantPricingDisplay } from "@/lib/pricing/pdp-variant-pricing-display";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

export function PdpVariantPricePanel({
  parentFrom,
  selectedPricing,
  compact,
}: {
  parentFrom: PdpParentFromDisplay | null;
  selectedPricing: PdpSelectedVariantPricingDisplay;
  compact?: boolean;
}) {
  return (
    <div className={`space-y-2 ${compact ? "" : "rounded-lg border border-white/10 bg-[#141414] px-3 py-3"}`}>
      {parentFrom ? (
        <div className="space-y-0.5">
          <p className={`font-bold tabular-nums text-sales ${compact ? "text-[12px]" : "text-sm"}`}>
            From {usd.format(parentFrom.fromUsd)}
          </p>
          <p className="text-[10px] leading-snug text-white/45">
            Lowest published list across sizes on this product (not specific to one SKU).
          </p>
        </div>
      ) : null}

      <SelectedVariantPricingBlock selectedPricing={selectedPricing} compact={compact} />
    </div>
  );
}

function SelectedVariantPricingBlock({
  selectedPricing,
  compact,
}: {
  selectedPricing: PdpSelectedVariantPricingDisplay;
  compact?: boolean;
}) {
  if (selectedPricing.kind === "tier_reference") {
    return (
      <div
        className={`rounded-md border border-emerald-500/25 bg-emerald-500/[0.07] ${compact ? "px-2 py-1.5" : "px-2.5 py-2"} text-[11px] leading-snug text-white/80`}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Selected size · list pricing</p>
        <p className={`font-semibold text-emerald-200/95 ${compact ? "text-[11px]" : ""}`}>
          {selectedPricing.tierLabel} tier reference
        </p>
        <p className="mt-1 tabular-nums text-white/85">
          Site list {usd.format(selectedPricing.listUsd)} · Tier unit reference {usd.format(selectedPricing.yourUsd)}
        </p>
        <p className="mt-1 text-[10px] text-white/45">
          Server-resolved for this SKU ({selectedPricing.pricingSource}). Quote responses from our team are separate from
          this reference.
        </p>
      </div>
    );
  }

  if (selectedPricing.kind === "list_only") {
    return (
      <div className={compact ? "text-[11px]" : "text-[12px]"}>
        <p className="text-[10px] font-semibold uppercase tracking-wide text-white/45">Selected size · list pricing</p>
        <p className={`mt-0.5 font-bold tabular-nums text-white ${compact ? "text-[12px]" : "text-sm"}`}>
          List {usd.format(selectedPricing.listUsd)}
        </p>
        <p className="mt-1 text-[10px] text-white/45">Published list for this SKU ({selectedPricing.pricingSource}).</p>
      </div>
    );
  }

  return (
    <div className={compact ? "text-[11px]" : "text-[12px]"}>
      <p className="font-medium text-white/45">No published list for this size</p>
      <p className="mt-1 text-[10px] leading-snug text-white/40">
        Request pricing or add to quote — our team will confirm availability and program pricing.
      </p>
      <Link
        href="/request-pricing"
        className="mt-2 inline-flex text-[11px] font-semibold text-[#f06232] hover:underline"
      >
        Request pricing
      </Link>
    </div>
  );
}
