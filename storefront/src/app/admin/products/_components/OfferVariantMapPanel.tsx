"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  adminPrimaryButton,
  adminSecondaryButton,
  adminTableBody,
  adminTableCell,
  adminTableHead,
  adminTableHeadCell,
  adminTableRowHover,
} from "@/components/admin/admin-theme-utils";
import { TableCard } from "@/components/admin";
import { cn } from "@/lib/utils";
import type { OfferVariantMapPayload } from "@/lib/admin/fetch-product-offer-variant-map";

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function OfferVariantMapPanel({
  productId,
  map,
}: {
  productId: string;
  map: OfferVariantMapPayload;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!map.available) {
    if (map.reason === "migration_pending") {
      return (
        <p className="text-sm text-admin-muted">
          Offer mapping is unavailable until migration <span className="font-mono">20261227122100</span> is
          applied. No live mappings were written.
        </p>
      );
    }
    return <p className="text-sm text-admin-muted">Offer mapping is unavailable in this environment.</p>;
  }

  async function submit(offerId: string, catalogVariantId: string | null) {
    setBusy(offerId + String(catalogVariantId));
    setError(null);
    try {
      const res = await fetch(`/admin/api/products/${productId}/offer-variant-map`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, catalogVariantId }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Mapping failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Mapping failed");
    } finally {
      setBusy(null);
    }
  }

  const variantById = new Map(map.variants.map((v) => [v.id, v]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-admin-secondary">
        Confirm an explicit offer → variant link. SKUs are not rewritten. Candidates are shown for operator
        review only — nothing is auto-mapped.
      </p>
      {error ? <p className="text-sm text-admin-warning">{error}</p> : null}
      <TableCard>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className={cn(adminTableHead, "border-b border-admin-border")}>
              <tr>
                <th className={cn(adminTableHeadCell, "p-3")}>Variant</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Size</th>
                <th className={cn(adminTableHeadCell, "p-3")}>GloveCubs SKU</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Manufacturer SKU</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Supplier</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Supplier SKU</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Sell price</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Status</th>
                <th className={cn(adminTableHeadCell, "p-3")}>Action</th>
              </tr>
            </thead>
            <tbody className={adminTableBody}>
              {map.offers.length === 0 ? (
                <tr>
                  <td className={cn(adminTableCell, "p-3 text-admin-muted")} colSpan={9}>
                    No supplier offers on this product.
                  </td>
                </tr>
              ) : (
                map.offers.map((o) => {
                  const mapped = o.catalogVariantId ? variantById.get(o.catalogVariantId) : null;
                  const candidate = map.apparentCandidates.find((c) => c.offerId === o.id);
                  return (
                    <tr key={o.id} className={adminTableRowHover}>
                      <td className={cn(adminTableCell, "p-3")}>
                        {mapped ? mapped.variantSku : "Unmapped"}
                      </td>
                      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                        {mapped?.sizeCode ?? candidate?.sizeCode ?? "—"}
                      </td>
                      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                        {mapped?.variantSku ?? candidate?.variantSku ?? "—"}
                      </td>
                      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>
                        {mapped?.manufacturerSku ?? candidate?.manufacturerSku ?? "—"}
                      </td>
                      <td className={cn(adminTableCell, "p-3")}>{o.supplierName ?? o.supplierId.slice(0, 8)}</td>
                      <td className={cn(adminTableCell, "p-3 font-mono text-xs")}>{o.supplierSku}</td>
                      <td className={cn(adminTableCell, "p-3")}>{money(o.sellPrice)}</td>
                      <td className={cn(adminTableCell, "p-3 text-xs")}>
                        {o.isActive ? "Active" : "Inactive"}
                        {candidate?.sizeConflict ? (
                          <span className="ml-1 text-admin-warning">size conflict</span>
                        ) : null}
                      </td>
                      <td className={cn(adminTableCell, "p-3")}>
                        <div className="flex flex-wrap gap-2">
                          {o.catalogVariantId ? (
                            <button
                              type="button"
                              className={cn(adminSecondaryButton, "text-xs")}
                              disabled={busy != null}
                              onClick={() => submit(o.id, null)}
                            >
                              Leave unmapped
                            </button>
                          ) : (
                            map.variants.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                className={cn(adminPrimaryButton, "text-xs")}
                                disabled={busy != null}
                                onClick={() => submit(o.id, v.id)}
                              >
                                Map {v.sizeCode || v.variantSku}
                              </button>
                            ))
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </TableCard>
    </div>
  );
}
