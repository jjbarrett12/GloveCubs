/**
 * Discovery intent registry — maps stable intent IDs to canonical store/RFQ params.
 * Values are explicit subsets of StorefrontFilterParams / RequestPricingForm keys only.
 * No parallel facet taxonomy: store slices must match real catalog URL + constraint behavior.
 */

import type { StorefrontFilterParams } from "@/lib/catalog/store-filter-types";
import type { RequestPricingQueryParams } from "@/lib/discovery/request-pricing-url";

export type DiscoveryIntentDefinition = {
  id: string;
  label?: string;
  description?: string;
  /** Canonical store filter slice */
  store?: Partial<StorefrontFilterParams>;
  /** Canonical RFQ prefill slice */
  rfq?: RequestPricingQueryParams;
  /** Hint for analytics / future invoice handoff — not a URL param unless separately wired */
  tags?: string[];
};

/** Stable intent IDs → definition (explicit store/RFQ params only). */
export const DISCOVERY_INTENTS: Record<string, DiscoveryIntentDefinition> = {
  "store.search.automotive": {
    id: "store.search.automotive",
    store: { q: "automotive gloves" },
  },

  "rfq.store.tile.nitrile_exam": {
    id: "rfq.store.tile.nitrile_exam",
    rfq: { product: "Nitrile exam gloves (case quantities)" },
  },
  "rfq.store.tile.food_service": { id: "rfq.store.tile.food_service", rfq: { industry: "hospitality" } },
  "rfq.store.tile.industrial": { id: "rfq.store.tile.industrial", rfq: { industry: "industrial" } },
  "rfq.store.tile.janitorial": { id: "rfq.store.tile.janitorial", rfq: { industry: "janitorial" } },
  "rfq.store.tile.healthcare": { id: "rfq.store.tile.healthcare", rfq: { industry: "healthcare" } },
  "rfq.store.tile.black_nitrile": {
    id: "rfq.store.tile.black_nitrile",
    rfq: { product: "Black nitrile gloves (program sourcing)" },
  },
  "rfq.store.tile.latex_free": {
    id: "rfq.store.tile.latex_free",
    rfq: { product: "Latex-free glove program" },
  },

  "rfq.industries.automotive": { id: "rfq.industries.automotive", rfq: { source: "industries_automotive" } },

  "store.landing.janitorial": { id: "store.landing.janitorial", store: { q: "janitorial gloves" } },
  "store.landing.hospitality": { id: "store.landing.hospitality", store: { q: "hospitality food service gloves" } },
  "store.landing.healthcare": { id: "store.landing.healthcare", store: { q: "healthcare exam gloves" } },
  "store.landing.industrial": { id: "store.landing.industrial", store: { q: "industrial work gloves" } },

  "store.gf.healthcare": { id: "store.gf.healthcare", store: { q: "healthcare medical exam gloves" } },
  "store.gf.food-service": { id: "store.gf.food-service", store: { q: "food service disposable gloves" } },
  "store.gf.industrial": { id: "store.gf.industrial", store: { q: "industrial warehouse gloves" } },
  "store.gf.automotive": { id: "store.gf.automotive", store: { q: "automotive shop gloves" } },
  "store.gf.janitorial": { id: "store.gf.janitorial", store: { q: "janitorial cleaning gloves" } },
  "store.gf.lab": { id: "store.gf.lab", store: { q: "lab chemical resistant gloves" } },
  "store.gf.safety": { id: "store.gf.safety", store: { q: "cut resistant safety gloves" } },
  "store.gf.general": { id: "store.gf.general", store: { q: "general purpose disposable gloves" } },

  /* Industry vertical — category + facet combos (no legacy industry=/collection= params) */
  "store.cat.nitrile-gloves": { id: "store.cat.nitrile-gloves", store: { category: "nitrile-gloves" } },
  "store.cat.vinyl-gloves": { id: "store.cat.vinyl-gloves", store: { category: "vinyl-gloves" } },
  "store.cat.work-gloves": { id: "store.cat.work-gloves", store: { category: "work-gloves" } },
  "store.cat.chemical-resistant": { id: "store.cat.chemical-resistant", store: { category: "chemical-resistant" } },
  "store.cat.liners": { id: "store.cat.liners", store: { category: "liners" } },
  "store.cat.bulk": { id: "store.cat.bulk", store: { category: "bulk" } },
  "store.hospitality.black_nitrile": {
    id: "store.hospitality.black_nitrile",
    store: { category: "nitrile-gloves", color: ["black"] },
  },

  /* Former “collection=” links — honest text search (not facet claims) */
  "store.search.chemical_handling": { id: "store.search.chemical_handling", store: { q: "chemical handling gloves" } },
  "store.search.ppe_packs": { id: "store.search.ppe_packs", store: { q: "ppe pack gloves" } },
  "store.search.restroom_sanitation": { id: "store.search.restroom_sanitation", store: { q: "restroom sanitation gloves" } },
  "store.search.cold_weather": { id: "store.search.cold_weather", store: { q: "cold weather freezer gloves" } },
  "store.search.food_prep": { id: "store.search.food_prep", store: { q: "food prep line service gloves" } },
  "store.search.powder_free_nitrile": {
    id: "store.search.powder_free_nitrile",
    store: { q: "powder free nitrile exam gloves", category: "nitrile-gloves" },
  },
  "store.search.latex_free_nitrile": {
    id: "store.search.latex_free_nitrile",
    store: { q: "latex free nitrile gloves", category: "nitrile-gloves" },
  },
  "store.search.textured_grip": { id: "store.search.textured_grip", store: { q: "textured grip exam gloves" } },
  "store.search.sensitive_skin": { id: "store.search.sensitive_skin", store: { q: "sensitive skin exam gloves" } },
  "store.search.cut_resistant": { id: "store.search.cut_resistant", store: { q: "ansi cut resistant gloves" } },
};
