"use client";

import type { SellUnit } from "@commerce-packaging/types";
import type { StoreProductRow } from "@/lib/catalog/store-products";
import type { PdpCommercePackaging } from "@/lib/catalog/store-product-commerce";
import { buildQuoteLineCommerceFields } from "@/lib/quote-cart/commerce-line";
import type { QuoteCartItem } from "@/lib/quote-cart/types";
import { Button } from "@/components/ui/button";
import { useQuoteCart } from "@/components/quote/QuoteCartProvider";
import { canAddProductRowToQuote, isQuoteVariantIdentityComplete } from "@/lib/catalog/store-quote-rules";
import { cn } from "@/lib/utils";

type CommerceExtras = Pick<
  QuoteCartItem,
  | "sell_unit"
  | "unit_price_major"
  | "units_per_case"
  | "cases_per_pallet"
  | "units_per_pallet"
  | "unit_noun"
  | "commerce_summary"
  | "line_unit_label"
>;

type Props = {
  product: StoreProductRow;
  className?: string;
  quantity?: number;
  commerce?: CommerceExtras;
};

function listingCommerceFromProduct(product: StoreProductRow): CommerceExtras {
  const pkg: PdpCommercePackaging = {
    sellByCaseEnabled: true,
    sellByPalletEnabled: product.palletPricingAvailable,
    casePrice: product.casePrice ?? product.bestPrice,
    caseListPrice: product.caseListPrice,
    caseOnSale: product.caseOnSale,
    palletPrice: product.palletPrice,
    palletListPrice: product.palletListPrice,
    palletOnSale: product.palletOnSale,
    unitsPerCase: product.unitsPerCase,
    casesPerPallet: null,
    unitsPerPallet: null,
    unitNoun: product.unitNoun,
    caseLabel: product.caseLabel ?? null,
    palletLabel: product.palletLabel ?? null,
    palletBuyingEnabled: false,
  };
  return buildQuoteLineCommerceFields("case", 1, pkg);
}

export function AddToQuoteButton({ product, className, quantity = 1, commerce }: Props) {
  const { addItem } = useQuoteCart();
  const allowed = canAddProductRowToQuote(product);
  const complete = isQuoteVariantIdentityComplete(product);
  const disabled = !allowed || !complete;

  const disabledReason = !allowed
    ? product.activeVariantCount > 1
      ? "Select a size on the product page before adding to quote."
      : "This product cannot be added to quote from the listing."
    : !complete
      ? "Variant SKU and catalog variant id are required for quote lines."
      : null;

  return (
    <Button
      type="button"
      disabled={disabled}
      title={disabledReason ?? undefined}
      className={cn("w-full bg-[hsl(var(--primary))] text-white hover:opacity-90 disabled:opacity-50", className)}
      onClick={() => {
        if (!allowed || !complete) return;
        const commerceFields = commerce ?? listingCommerceFromProduct(product);
        addItem(
          {
            product_id: product.id,
            name: product.name,
            slug: product.slug,
            brandName: product.brandName,
            catalog_variant_id: product.catalogVariantId ?? undefined,
            variant_sku: product.variantSku ?? undefined,
            size_code: product.sizeCode ?? undefined,
            ...commerceFields,
          },
          quantity
        );
      }}
    >
      Add to Quote
    </Button>
  );
}

export function buildPdpQuoteCommerce(
  commerce: PdpCommercePackaging,
  sellUnit: SellUnit,
  quantity: number,
  casePriceOverride?: number | null
): CommerceExtras {
  return buildQuoteLineCommerceFields(
    sellUnit,
    quantity,
    commerce,
    sellUnit === "case" ? casePriceOverride : undefined
  );
}
