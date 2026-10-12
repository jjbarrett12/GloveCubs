import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { validatePublishedListApproval } from "./published-list-pricing";

const REVIEW = path.resolve(__dirname, "../../app/actions/review.ts");
const ADMIN_ROUTE = path.resolve(
  __dirname,
  "../../../../storefront/src/app/admin/api/products/[productId]/offer-variant-map/route.ts"
);

describe("published list approval paths share validatePublishedListApproval", () => {
  it("storefront admin is the explicit list approval path and still uses the shared validator", () => {
    const review = readFileSync(REVIEW, "utf8");
    const route = readFileSync(ADMIN_ROUTE, "utf8");
    expect(review).not.toContain("validatePublishedListApproval");
    expect(review).not.toContain("withOperatorApprovedSellPrice");
    expect(route).toContain("validatePublishedListApproval");
    expect(route).toContain("gate.reason");
    expect(route).toContain("withOperatorApprovedSellPrice");
  });

  it("same helper rejects $85/$100 and allows $151.79 for cost $85", () => {
    expect(validatePublishedListApproval({ cost: 85, sellPrice: 85 }).ok).toBe(false);
    expect(validatePublishedListApproval({ cost: 85, sellPrice: 100 }).ok).toBe(false);
    expect(validatePublishedListApproval({ cost: 85, sellPrice: 151.79 }).ok).toBe(true);
  });
});
