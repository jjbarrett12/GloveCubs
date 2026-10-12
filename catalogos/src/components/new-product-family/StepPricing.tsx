"use client";

import { minimumSafePublishedList } from "@/lib/pricing/published-list-pricing";
import { costForSize } from "@/lib/new-product-family/cost";
import type { NewProductFamilyDraft } from "@/lib/new-product-family/types";

function money(value: number | null): string {
  if (value == null) return "—";
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function StepPricing({ draft }: { draft: NewProductFamilyDraft }) {
  const rows = draft.sizes.map((size) => {
    const cost = costForSize(draft, size);
    return {
      size: size.toUpperCase(),
      quoted: cost.quotedCaseCost,
      landed: cost.landedCaseCost,
      floor: minimumSafePublishedList(cost.landedCaseCost),
    };
  });

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Customer list price is not set in this wizard. After publish, approve it in storefront admin. Pricing
        Authority only discounts an approved list.
      </p>
      <p className="text-xs text-muted-foreground">
        The minimum safe list is a floor for that later approval. It is not saved as the customer price.
      </p>
      <ul className="space-y-2 text-sm">
        {rows.map((row) => (
          <li key={row.size} className="rounded-md border border-border/70 px-3 py-2">
            <span className="font-medium">{row.size}</span>
            <span className="mt-1 block text-xs text-muted-foreground">
              Quoted {money(row.quoted)} · Landed {money(row.landed)} · Minimum safe list {money(row.floor)} ·
              Customer price not approved
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
