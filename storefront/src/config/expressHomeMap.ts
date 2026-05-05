/**
 * Homepage map embed (Salt Lake City HQ area).
 *
 * Default uses Google Maps `output=embed` (no Maps JavaScript API key required).
 * Override with NEXT_PUBLIC_HOME_MAP_EMBED_URL (full iframe src URL).
 * Set NEXT_PUBLIC_HOME_MAP_DISABLED=true to show static fallback instead of iframe.
 */

/** SLC area — coordinates embed; replace if your HQ pin differs. */
const DEFAULT_MAPS_EMBED_SRC =
  "https://maps.google.com/maps?q=40.760779,-111.891048&z=11&hl=en&ie=UTF8&output=embed";

export function isHomeMapEmbedDisabled(): boolean {
  const v = process.env.NEXT_PUBLIC_HOME_MAP_DISABLED?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Iframe `src` for the homepage service-area map (empty when embed is disabled). */
export function getHomeMapEmbedSrc(): string {
  if (isHomeMapEmbedDisabled()) return "";
  const custom = process.env.NEXT_PUBLIC_HOME_MAP_EMBED_URL?.trim();
  if (custom && custom !== "false") return custom;
  return DEFAULT_MAPS_EMBED_SRC;
}

/** @deprecated use getHomeMapEmbedSrc() */
export const EXPRESS_HOME_MAP_IFRAME_SRC = DEFAULT_MAPS_EMBED_SRC;
