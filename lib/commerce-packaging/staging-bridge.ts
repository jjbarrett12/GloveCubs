import { extractCommercePackagingFromHtml } from "./extract";
import { normalizeCommercePackaging } from "./labels";
import type { CommercePackagingInput, CommercePackagingV1, InnerUnitType } from "./types";
import { COMMERCE_PACKAGING_SCHEMA_VERSION } from "./types";

function numPositive(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseExistingCommercePackaging(raw: unknown): CommercePackagingV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.schema_version !== COMMERCE_PACKAGING_SCHEMA_VERSION) return null;
  return o as CommercePackagingV1;
}

/** Map legacy CatalogOS staging fields into CommercePackagingV1 input. */
export function commercePackagingInputFromLegacyStagingFields(
  row: Record<string, unknown>,
  categorySlug?: string | null
): CommercePackagingInput {
  const boxesPerCase = numPositive(row.boxes_per_case);
  const glovesPerBox = numPositive(row.gloves_per_box ?? row.box_qty);
  const totalUnits = numPositive(row.total_gloves_per_case ?? row.total_units_per_case);
  const caseQty = numPositive(row.case_qty);
  const pricing = row.pricing as { normalized_case_cost?: number } | undefined;
  const casePrice = numPositive(
    row.case_price ?? row.price ?? row.normalized_case_cost ?? pricing?.normalized_case_cost
  );

  const parseWarnings: string[] = [];
  let inner_unit_type: InnerUnitType | null = null;
  let units_per_inner: number | null = null;
  let inners_per_case: number | null = null;
  let units_per_case: number | null = totalUnits ?? caseQty;

  const dozenInCase = numPositive(row.dozen_per_case ?? row.dozens_per_case);
  if (dozenInCase != null) {
    inner_unit_type = "dozen";
    inners_per_case = dozenInCase;
    units_per_inner = 12;
    units_per_case = dozenInCase * 12;
  } else if (boxesPerCase != null && glovesPerBox != null) {
    inner_unit_type = "box";
    inners_per_case = boxesPerCase;
    units_per_inner = glovesPerBox;
  } else if (units_per_case != null && inner_unit_type == null) {
    parseWarnings.push("inner packaging unknown");
  }

  return {
    inner_unit_type,
    units_per_inner,
    inners_per_case,
    units_per_case,
    cases_per_pallet: numPositive(row.cases_per_pallet),
    case_price: casePrice,
    pallet_price: numPositive(row.pallet_price),
    parse_warnings: parseWarnings,
    field_provenance: {},
  };
}

function mergeCommercePackagingV1(
  primary: CommercePackagingV1,
  secondary: CommercePackagingV1,
  categorySlug?: string | null
): CommercePackagingV1 {
  const pick = <K extends keyof CommercePackagingV1>(key: K): CommercePackagingV1[K] => {
    const a = primary[key];
    const b = secondary[key];
    if (a != null && a !== "" && !(typeof a === "number" && a <= 0)) return a;
    return b;
  };

  return normalizeCommercePackaging(
    {
      sell_by_pallet_enabled: pick("sell_by_pallet_enabled"),
      inner_unit_type: pick("inner_unit_type"),
      units_per_inner: pick("units_per_inner"),
      inners_per_case: pick("inners_per_case"),
      units_per_case: pick("units_per_case"),
      units_per_case_overridden: primary.units_per_case_overridden || secondary.units_per_case_overridden,
      unit_noun: pick("unit_noun"),
      cases_per_pallet: pick("cases_per_pallet"),
      units_per_pallet: pick("units_per_pallet"),
      units_per_pallet_overridden: primary.units_per_pallet_overridden || secondary.units_per_pallet_overridden,
      case_price: pick("case_price"),
      pallet_price: pick("pallet_price"),
      pallet_discount_percent: pick("pallet_discount_percent"),
      field_provenance: { ...secondary.field_provenance, ...primary.field_provenance },
      parse_warnings: [...new Set([...secondary.parse_warnings, ...primary.parse_warnings])],
    },
    categorySlug
  );
}

export type ResolveCommercePackagingOptions = {
  html?: string;
  pageText?: string;
  url?: string;
  specTable?: Record<string, string>;
  categorySlug?: string | null;
};

/** Resolve canonical CommercePackagingV1 from staging row + optional HTML context. */
export function resolveCommercePackagingForStagingRow(
  row: Record<string, unknown>,
  options: ResolveCommercePackagingOptions = {}
): CommercePackagingV1 {
  const categorySlug =
    options.categorySlug ??
    (typeof row.category_slug === "string" ? row.category_slug : null) ??
    (typeof row.category === "string" ? row.category : null);

  const existing = parseExistingCommercePackaging(row.commerce_packaging);
  const legacy = normalizeCommercePackaging(
    commercePackagingInputFromLegacyStagingFields(row, categorySlug),
    categorySlug
  );

  let merged = existing ? mergeCommercePackagingV1(existing, legacy, categorySlug) : legacy;

  const html = options.html?.trim();
  const pageText = options.pageText?.trim();
  if (html || pageText) {
    const extracted = extractCommercePackagingFromHtml({
      html,
      pageText,
      url: options.url,
      categorySlug,
      specTable: options.specTable,
    });
    merged = mergeCommercePackagingV1(extracted, merged, categorySlug);
  }

  return merged;
}

export function attachCommercePackagingToParsedRow(
  row: Record<string, unknown>,
  ctx: { parsedPage?: Record<string, unknown>; categorySlug?: string | null } = {}
): Record<string, unknown> {
  const parsedPage = ctx.parsedPage;
  const html =
    typeof parsedPage?.raw_html_snippet === "string"
      ? parsedPage.raw_html_snippet
      : typeof parsedPage?.html === "string"
        ? parsedPage.html
        : undefined;
  const pageText = [
    parsedPage?.product_title,
    parsedPage?.description,
    row.long_description,
    row.description,
  ]
    .filter((x) => typeof x === "string" && x.trim())
    .join(" ");

  const cp = resolveCommercePackagingForStagingRow(row, {
    html,
    pageText: pageText || undefined,
    url: typeof row.source_url === "string" ? row.source_url : undefined,
    specTable:
      parsedPage?.spec_table && typeof parsedPage.spec_table === "object" && !Array.isArray(parsedPage.spec_table)
        ? (parsedPage.spec_table as Record<string, string>)
        : undefined,
    categorySlug: ctx.categorySlug,
  });

  return { ...row, commerce_packaging: cp };
}

export function getCommercePackagingFromNormalized(nd: Record<string, unknown>): CommercePackagingV1 | null {
  const existing = parseExistingCommercePackaging(nd.commerce_packaging);
  if (existing) return existing;
  const resolved = resolveCommercePackagingForStagingRow(nd);
  if (resolved.units_per_case == null && resolved.case_price == null) return null;
  return resolved;
}
