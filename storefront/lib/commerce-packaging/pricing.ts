import type { CommercePackagingV1 } from "./types";

function finitePositive(n: unknown): number | null {
  if (n == null) return null;
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return null;
  return x;
}

export type CommerceUnitPricing = {
  /** Regular/list price shown struck through when on sale. */
  listPrice: number | null;
  /** Promotional price — same as list when not on sale. */
  salePrice: number | null;
  /** Price used for checkout and quotes. */
  effectivePrice: number | null;
  onSale: boolean;
};

export function resolveCaseUnitPricing(
  cp: Pick<CommercePackagingV1, "case_price" | "compare_at_case_price"> | null | undefined
): CommerceUnitPricing {
  const saleRaw = finitePositive(cp?.case_price);
  const listRaw = finitePositive(cp?.compare_at_case_price);

  if (saleRaw != null && listRaw != null && listRaw > saleRaw) {
    return { listPrice: listRaw, salePrice: saleRaw, effectivePrice: saleRaw, onSale: true };
  }

  const effective = saleRaw ?? listRaw;
  return { listPrice: null, salePrice: effective, effectivePrice: effective, onSale: false };
}

export function resolvePalletUnitPricing(
  cp: Pick<CommercePackagingV1, "pallet_price" | "compare_at_pallet_price"> | null | undefined
): CommerceUnitPricing {
  const saleRaw = finitePositive(cp?.pallet_price);
  const listRaw = finitePositive(cp?.compare_at_pallet_price);

  if (saleRaw != null && listRaw != null && listRaw > saleRaw) {
    return { listPrice: listRaw, salePrice: saleRaw, effectivePrice: saleRaw, onSale: true };
  }

  const effective = saleRaw ?? listRaw;
  return { listPrice: null, salePrice: effective, effectivePrice: effective, onSale: false };
}

export function resolveEffectiveCasePriceFromPackaging(
  cp: Pick<CommercePackagingV1, "case_price" | "compare_at_case_price"> | null | undefined
): number | null {
  return resolveCaseUnitPricing(cp).effectivePrice;
}

export function resolveEffectivePalletPriceFromPackaging(
  cp: Pick<CommercePackagingV1, "pallet_price" | "compare_at_pallet_price"> | null | undefined
): number | null {
  return resolvePalletUnitPricing(cp).effectivePrice;
}
