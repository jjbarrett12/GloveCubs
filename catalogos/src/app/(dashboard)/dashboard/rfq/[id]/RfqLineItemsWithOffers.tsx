"use client";

import type { QuoteLineItemRow } from "@/lib/quotes/types";
import type { ProductOffersResult } from "@/lib/quotes/offer-matching";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function snapshotName(item: QuoteLineItemRow): string {
  const snap = item.product_snapshot as { name?: string } | undefined;
  return snap?.name ?? "—";
}

export function RfqLineItemsWithOffers({
  lineItems,
  offersByProduct,
}: {
  lineItems: QuoteLineItemRow[];
  offersByProduct: Map<string, ProductOffersResult>;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Line items & supplier match</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-3 font-medium">Product</th>
                <th className="text-right p-3 font-medium">Qty</th>
                <th className="text-left p-3 font-medium">Notes</th>
                <th className="text-left p-3 font-medium">Best offer</th>
                <th className="text-left p-3 font-medium">Supplier</th>
                <th className="text-left p-3 font-medium">Lead time</th>
                <th className="text-left p-3 font-medium">Alternates</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.map((line) => {
                const offers = offersByProduct.get(line.product_id);
                const hasOffers = offers?.has_offers ?? false;
                const best = offers?.best ?? null;
                const alts = offers?.alternates ?? [];
                return (
                  <tr key={line.id} className="border-b border-border/50">
                    <td className="p-3 font-medium">{snapshotName(line)}</td>
                    <td className="p-3 text-right">{line.quantity}</td>
                    <td className="p-3 text-muted-foreground max-w-[120px] truncate" title={line.notes ?? undefined}>
                      {line.notes ?? "—"}
                    </td>
                    <td className="p-3">
                      {best ? (
                        <span className="font-medium">${Number(best.display_price).toFixed(2)}</span>
                      ) : (
                        <Badge variant="destructive">No match</Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {best ? best.supplier_name : (hasOffers ? "—" : "Manual source")}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {best?.lead_time_days != null ? `${best.lead_time_days} days` : "—"}
                    </td>
                    <td className="p-3">
                      {alts.length > 0 ? (
                        <span className="text-muted-foreground">
                          {alts.length} other{alts.length > 1 ? "s" : ""}: {alts.map((a) => a.supplier_name).join(", ")}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lineItems.some((l) => !(offersByProduct.get(l.product_id)?.has_offers)) && (
          <div className="p-3 border-t border-border bg-muted/30 text-sm text-muted-foreground">
            Items with no supplier match need manual sourcing.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
