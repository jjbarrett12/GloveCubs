/**
 * Mirrors public/js/app.js — HOME_BRAND_LIST and logo path resolution for homepage carousel + footer tiles.
 */

export const HOME_BRAND_LIST = [
  "Hospeco",
  "Global Glove",
  "Safeko",
  "PIP",
  "Ansell",
  "SHOWA",
  "Growl Gloves",
  "Semper Guard",
  "Ammex",
  "Tradex",
] as const;

/**
 * Optional verified `brands.id` (Supabase) keyed by the same display string as {@link HOME_BRAND_LIST}.
 * Leave empty until ids are confirmed — links fall back to `q` search.
 */
export const HOME_BRAND_CATALOG_ID_BY_NAME: Partial<Record<string, string>> = {};

const BRAND_TO_LOGO_SLUG: Record<string, string> = {
  Hospeco: "hospeco",
  "Global Glove": "global-glove",
  Safeko: "safeko",
  PIP: "pip",
  Ansell: "ansell",
  SHOWA: "showa",
  "Growl Gloves": "growl-gloves",
  "Semper Guard": "semper-guard",
  Ammex: "ammex",
  Tradex: "tradex",
};

const BRAND_LOGO_FILENAME: Record<string, string> = {
  Hospeco: "Hospeco.png",
  "Global Glove": "Global_Glove.png",
  Safeko: "Safeko.png",
  PIP: "pip-global-safety-logo.png",
  "Growl Gloves": "growl-gloves.png",
  Ansell: "Ansell.png",
  SHOWA: "SHOWA.png",
  "Semper Guard": "Semper.png",
  Ammex: "Ammex.png",
  Tradex: "Tradex.png",
};

function logoPublicPath(filename: string): string {
  return `/images/logos/${encodeURIComponent(filename)}`;
}

export function getBrandLogoSlugPath(brand: string): string | null {
  const slug = BRAND_TO_LOGO_SLUG[brand];
  return slug ? `/images/logos/${slug}.svg` : null;
}

export function getBrandLogoPath(brand: string): string | null {
  if (!brand) return null;
  const exact = BRAND_LOGO_FILENAME[brand];
  if (exact) return logoPublicPath(exact);
  return getBrandLogoSlugPath(brand);
}
