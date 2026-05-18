"use client";

import type { PdpVariantRow } from "@/lib/catalog/store-product-detail";
import type { PdpVariantPricingRow } from "@/lib/pricing/variant-pricing-contracts";
import { matrixShowsListUnitColumn, variantListUnitLabel } from "@/lib/pricing/pdp-variant-pricing-display";
import { cn } from "@/lib/utils";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });

type Props = {
  variants: PdpVariantRow[];
  variantPricing: PdpVariantPricingRow[];
  selectedVariantId: string | null;
  onSelectVariant: (variantId: string) => void;
};

export function PdpVariantMatrix({ variants, variantPricing, selectedVariantId, onSelectVariant }: Props) {
  if (variants.length === 0) return null;

  const selected = variants.find((v) => v.id === selectedVariantId) ?? variants[0];
  const showListColumn = matrixShowsListUnitColumn(variantPricing);

  return (
    <section id="variants" className="scroll-mt-24 rounded-xl border border-white/10 bg-[#141414]">
      <div className="border-b border-white/10 px-3 py-2.5 sm:px-4">
        <h2 className="text-[12px] font-bold uppercase tracking-wide text-white/80">Select size</h2>
        <p className="mt-0.5 text-[11px] text-white/45">Choose the variant you want on your quote request.</p>
      </div>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex flex-wrap gap-2" role="listbox" aria-label="Product sizes">
          {variants.map((v) => {
            const active = v.id === selected?.id;
            const label = v.size_code?.trim() || v.variant_sku;
            return (
              <button
                key={v.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => onSelectVariant(v.id)}
                className={cn(
                  "min-h-11 min-w-[3.25rem] rounded-md border px-3 py-2 text-[12px] font-semibold transition-colors",
                  active
                    ? "border-[#f06232] bg-[#f06232]/15 text-[#ffb27a]"
                    : "border-white/15 bg-black/30 text-white/80 hover:border-[#f06232]/40 hover:text-white"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        {showListColumn ? (
          <div className="overflow-x-auto rounded-md border border-white/10">
            <table className="w-full min-w-[320px] text-left text-[11px] text-white/75">
              <thead className="border-b border-white/10 bg-black/30 text-[10px] uppercase tracking-wide text-white/45">
                <tr>
                  <th className="px-3 py-2 font-semibold">Size</th>
                  <th className="px-3 py-2 font-semibold">SKU</th>
                  <th className="px-3 py-2 font-semibold">List unit</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((v) => {
                  const listRaw = variantListUnitLabel(v.id, variantPricing);
                  const listDisplay =
                    listRaw != null && Number.isFinite(Number(listRaw)) ? usd.format(Number(listRaw)) : "—";
                  return (
                    <tr
                      key={v.id}
                      className={cn(
                        "border-b border-white/[0.06] last:border-0",
                        v.id === selected?.id && "bg-[#f06232]/[0.06]"
                      )}
                    >
                      <td className="px-3 py-2 font-mono text-white/90">{v.size_code ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-white/80">{v.variant_sku}</td>
                      <td className="px-3 py-2 tabular-nums text-white/85">{listDisplay}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          selected && (
            <dl className="grid gap-1 rounded-md border border-white/10 bg-black/25 px-3 py-2 text-[11px] sm:grid-cols-[auto_1fr]">
              <dt className="text-white/40">Size</dt>
              <dd className="font-mono text-white/85">{selected.size_code ?? "—"}</dd>
              <dt className="text-white/40">SKU</dt>
              <dd className="font-mono text-white/90">{selected.variant_sku}</dd>
            </dl>
          )
        )}
      </div>
    </section>
  );
}
