/**
 * Store “Industries” facet — display labels + stable order for sidebar UI.
 * Slugs and labels derive from @/lib/catalog/attribute-value-labels (canonical).
 */
import { getStoreIndustryFacetRows } from "@/lib/catalog/attribute-value-labels";

export const STORE_INDUSTRY_FACET_ROWS: { value: string; label: string }[] = getStoreIndustryFacetRows();
