"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  adminPrimaryButton,
  adminSecondaryButton,
} from "@/components/admin/admin-theme-utils";
import { TableCard } from "@/components/admin";
import { cn } from "@/lib/utils";
import type {
  OfferVariantMapOffer,
  OfferVariantMapPayload,
  OfferVariantMapVariant,
} from "@/lib/admin/fetch-product-offer-variant-map";
import { grossMarginVsCost, paV2TierPricesFromList, publishedListApprovalInputValue, validatePublishedListApproval } from "@/lib/pricing/published-list-pricing";

function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function gmLabel(price: number | null, cost: number | null): string {
  const gm = grossMarginVsCost(price, cost);
  if (gm.dollars == null || gm.percent == null) return "—";
  return `${money(gm.dollars)} (${gm.percent.toFixed(1)}%)`;
}

function packLabel(o: OfferVariantMapOffer): string {
  const basis = o.costBasis ?? "—";
  const units = o.unitsPerCase != null ? `${o.unitsPerCase} units` : "units unknown";
  return `${basis} · ${units}`;
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
          Offer mapping and list approval are unavailable until migrations{" "}
          <span className="font-mono">20261227122100</span> and{" "}
          <span className="font-mono">20261227122200</span> are applied. No live mappings or list
          approvals were written.
        </p>
      );
    }
    return <p className="text-sm text-admin-muted">Offer mapping is unavailable in this environment.</p>;
  }

  async function patchOffer(body: { offerId: string; catalogVariantId?: string | null; sellPrice?: number | null }) {
    setBusy(body.offerId + String(body.catalogVariantId ?? body.sellPrice));
    setError(null);
    try {
      const res = await fetch(`/admin/api/products/${productId}/offer-variant-map`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Update failed");
        return;
      }
      router.refresh();
    } catch {
      setError("Update failed");
    } finally {
      setBusy(null);
    }
  }

  const variantById = new Map(map.variants.map((v) => [v.id, v]));

  return (
    <div className="space-y-4">
      <p className="text-sm text-admin-secondary">
        Landed cost is internal. Published list is operator-approved and must meet the Kodiak 20% GM floor
        (list ≥ cost / 0.56). Recommended list equals that minimum. Unverified historical sell prices are
        not published and are not used as the approval draft. MAP stays blocked until a list is approved.
      </p>
      {error ? <p className="text-sm text-admin-warning">{error}</p> : null}
      {map.offers.length === 0 ? (
        <p className="text-sm text-admin-muted">No supplier offers on this product.</p>
      ) : (
        map.offers.map((o) => (
          <OfferCard
            key={`${o.id}-${o.sellPriceVerifiedAt ?? "unverified"}`}
            offer={o}
            variants={map.variants}
            mapped={o.catalogVariantId ? variantById.get(o.catalogVariantId) ?? null : null}
            candidate={map.apparentCandidates.find((c) => c.offerId === o.id)}
            busy={busy != null}
            onMap={(catalogVariantId) => patchOffer({ offerId: o.id, catalogVariantId })}
            onApprove={(sellPrice) => patchOffer({ offerId: o.id, sellPrice })}
          />
        ))
      )}
    </div>
  );
}

function OfferCard({
  offer,
  variants,
  mapped,
  candidate,
  busy,
  onMap,
  onApprove,
}: {
  offer: OfferVariantMapOffer;
  variants: OfferVariantMapVariant[];
  mapped: { variantSku: string; sizeCode: string | null; manufacturerSku: string | null } | null | undefined;
  candidate: { sizeCode: string | null; variantSku: string | null; manufacturerSku: string | null; sizeConflict: boolean } | undefined;
  busy: boolean;
  onMap: (catalogVariantId: string | null) => void;
  onApprove: (sellPrice: number | null) => void;
}) {
  const seed = publishedListApprovalInputValue({
    sellPrice: offer.sellPrice,
    verifiedAt: offer.sellPriceVerifiedAt,
    cost: offer.cost,
  });
  const [draft, setDraft] = useState(seed.input);
  const draftList = useMemo(() => {
    const n = Number(draft);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [draft]);
  const preview = paV2TierPricesFromList(draftList ?? 0);
  const approval = validatePublishedListApproval({ cost: offer.cost, sellPrice: draftList });
  const minSafe = seed.minimumSafeList;

  return (
    <TableCard>
      <div className="space-y-3 p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-admin-primary">
              {offer.supplierName ?? offer.supplierId.slice(0, 8)} ·{" "}
              <span className="font-mono text-xs">{offer.supplierSku}</span>
            </p>
            <p className="text-xs text-admin-muted">{packLabel(offer)}</p>
          </div>
          <p className="text-xs">
            {offer.listApproved ? (
              <span className="text-admin-success">Approved list</span>
            ) : (
              <span className="text-admin-warning">Unverified / unpublished</span>
            )}
            {offer.isActive ? "" : " · Inactive"}
            {candidate?.sizeConflict ? <span className="ml-1 text-admin-warning">size conflict</span> : null}
          </p>
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <p className="text-xs text-admin-muted">Landed cost</p>
            <p>{money(offer.cost)}</p>
          </div>
          <div>
            <p className="text-xs text-admin-muted">Minimum / recommended list</p>
            <p>{money(minSafe)}</p>
          </div>
          <div>
            <p className="text-xs text-admin-muted">Published list</p>
            <p>{offer.listApproved ? money(offer.sellPrice) : "—"}</p>
            {seed.unverifiedExistingList != null ? (
              <p className="text-xs text-admin-warning">
                Existing unverified value: {money(seed.unverifiedExistingList)}
                {minSafe != null && seed.unverifiedExistingList < minSafe
                  ? " — Price requires re-approval after cost change"
                  : ""}
              </p>
            ) : null}
          </div>
          <div>
            <label className="text-xs text-admin-muted" htmlFor={`list-${offer.id}`}>
              List to approve
            </label>
            <input
              id={`list-${offer.id}`}
              className="mt-1 w-full rounded border border-admin-border bg-admin-surface px-2 py-1 font-mono text-sm"
              inputMode="decimal"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="USD"
            />
            {!approval.ok && draftList != null ? (
              <p className="mt-1 text-xs text-admin-warning">
                {approval.reason === "below_minimum_margin"
                  ? `Below Kodiak 20% floor (min ${money(approval.minimumSafeList)})`
                  : approval.reason === "landed_cost_required"
                    ? "Landed cost required"
                    : "Enter a positive list"}
              </p>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead>
              <tr className="text-admin-muted">
                <th className="pb-1 pr-3 font-medium">Tier</th>
                <th className="pb-1 pr-3 font-medium">Price</th>
                <th className="pb-1 font-medium">GM vs cost</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="pr-3">List</td>
                <td className="pr-3">{money(draftList)}</td>
                <td>{gmLabel(draftList, offer.cost)}</td>
              </tr>
              <tr>
                <td className="pr-3">Cub (−10%)</td>
                <td className="pr-3">{money(preview?.cub ?? null)}</td>
                <td>{gmLabel(preview?.cub ?? null, offer.cost)}</td>
              </tr>
              <tr>
                <td className="pr-3">Grizzly (−20%)</td>
                <td className="pr-3">{money(preview?.grizzly ?? null)}</td>
                <td>{gmLabel(preview?.grizzly ?? null, offer.cost)}</td>
              </tr>
              <tr>
                <td className="pr-3">Kodiak (−30%)</td>
                <td className="pr-3">{money(preview?.kodiak ?? null)}</td>
                <td>{gmLabel(preview?.kodiak ?? null, offer.cost)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-xs text-admin-muted">
          Mapped: {mapped ? `${mapped.variantSku}${mapped.sizeCode ? ` (${mapped.sizeCode})` : ""}` : "Unmapped"}
          {mapped?.manufacturerSku ? ` · mfr ${mapped.manufacturerSku}` : candidate?.manufacturerSku ? ` · candidate ${candidate.manufacturerSku}` : ""}
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={cn(adminPrimaryButton, "text-xs")}
            disabled={busy || !approval.ok}
            onClick={() => onApprove(draftList)}
          >
            Approve list
          </button>
          <button
            type="button"
            className={cn(adminSecondaryButton, "text-xs")}
            disabled={busy}
            onClick={() => onApprove(null)}
          >
            Clear unpublished list
          </button>
          {offer.catalogVariantId ? (
            <button
              type="button"
              className={cn(adminSecondaryButton, "text-xs")}
              disabled={busy}
              onClick={() => onMap(null)}
            >
              Leave unmapped
            </button>
          ) : (
            variants.map((v) => (
              <button
                key={v.id}
                type="button"
                className={cn(adminPrimaryButton, "text-xs")}
                disabled={busy || !offer.listApproved}
                title={offer.listApproved ? undefined : "Approve a published list before mapping"}
                onClick={() => onMap(v.id)}
              >
                Map {v.sizeCode || v.variantSku}
              </button>
            ))
          )}
        </div>
      </div>
    </TableCard>
  );
}
