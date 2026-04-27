"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface OfferRow {
  supplier_sku: string;
  cost: number;
  sell_price?: number | null;
  lead_time_days: number | null;
}

function displayPrice(o: OfferRow): string {
  const p = o.sell_price != null && Number.isFinite(o.sell_price) ? o.sell_price : o.cost;
  return `$${Number(p).toFixed(2)}`;
}

interface SupplierOffersDisclosureProps {
  offers: OfferRow[];
}

/** Collapsed by default — primary PDP story stays the best normalized case price. */
export function SupplierOffersDisclosure({ offers }: SupplierOffersDisclosureProps) {
  if (offers.length === 0) return null;

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-0">
        <CardTitle className="text-base">Sourcing</CardTitle>
        <p className="text-sm text-muted-foreground">
          Optional detail: per-supplier lines behind your best case price.
        </p>
      </CardHeader>
      <CardContent className="pt-4">
        <details className="group">
          <summary className="cursor-pointer list-none text-sm font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              View supplier options
              <span aria-hidden className="text-muted-foreground group-open:rotate-180 transition-transform">
                ▼
              </span>
            </span>
          </summary>
          <div className="mt-4 rounded-md border border-border shadow-[inset_-10px_0_10px_-10px_hsl(var(--border))]">
            <p className="px-3 pt-2 text-xs text-muted-foreground md:hidden">Scroll sideways for full table.</p>
            <div className="overflow-x-auto [-webkit-overflow-scrolling:touch]">
            <table className="w-full min-w-[320px] text-sm">
              <caption className="sr-only">Supplier offers for this product</caption>
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th scope="col" className="px-3 py-2 text-left font-medium">
                    Supplier SKU
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Price
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Lead time
                  </th>
                </tr>
              </thead>
              <tbody>
                {offers.slice(0, 15).map((o, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="px-3 py-2 font-mono text-xs">{o.supplier_sku}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{displayPrice(o)}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {o.lead_time_days != null ? `${o.lead_time_days} days` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {offers.length > 15 && (
              <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
                +{offers.length - 15} more offer(s)
              </p>
            )}
            </div>
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
