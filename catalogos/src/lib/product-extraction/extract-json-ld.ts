import { extractJsonLd } from "@/lib/openclaw/parse-html";
import { collectStrings, makeFieldEvidence, strVal } from "./evidence-helpers";
import type { FieldEvidence } from "./types";

export type JsonLdExtractionResult = {
  rawItems: Record<string, unknown>[];
  productItems: Record<string, unknown>[];
  title?: FieldEvidence<string>;
  brand?: FieldEvidence<string>;
  manufacturer?: FieldEvidence<string>;
  sku?: FieldEvidence<string>;
  mpn?: FieldEvidence<string>;
  model?: FieldEvidence<string>;
  description?: FieldEvidence<string>;
  imageUrls: string[];
  offers: Record<string, unknown>[];
  productGroupHints: Record<string, unknown>[];
  variantRecords: Record<string, unknown>[];
};

function flattenJsonLdNodes(blocks: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    const graph = block["@graph"];
    if (Array.isArray(graph)) {
      out.push(...flattenJsonLdNodes(graph as Record<string, unknown>[]));
      continue;
    }
    if (Array.isArray(block)) {
      out.push(...flattenJsonLdNodes(block as Record<string, unknown>[]));
      continue;
    }
    out.push(block);
  }
  return out;
}

function nodeTypes(node: Record<string, unknown>): string[] {
  const t = node["@type"];
  if (typeof t === "string") return [t.toLowerCase()];
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === "string").map((x) => x.toLowerCase());
  return [];
}

function isProductLike(node: Record<string, unknown>): boolean {
  return nodeTypes(node).some((t) => t.includes("product"));
}

function isOfferLike(node: Record<string, unknown>): boolean {
  return nodeTypes(node).some((t) => t.includes("offer"));
}

function brandFromNode(node: Record<string, unknown>): string | undefined {
  const b = node.brand ?? node.manufacturer;
  const s = strVal(b);
  return s || undefined;
}

function imagesFromNode(node: Record<string, unknown>): string[] {
  const imgs = collectStrings(node.image);
  return [...new Set(imgs.filter((u) => /^https?:\/\//i.test(u) || u.startsWith("//")))];
}

function variantNodesFromProduct(node: Record<string, unknown>): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const hasVariant = node.hasVariant ?? node.variesBy;
  if (Array.isArray(hasVariant)) {
    for (const v of hasVariant) {
      if (v && typeof v === "object") out.push(v as Record<string, unknown>);
    }
  }
  const models = node.model;
  if (Array.isArray(models)) {
    for (const m of models) {
      if (m && typeof m === "object") out.push(m as Record<string, unknown>);
    }
  }
  return out;
}

function pickBestProduct(nodes: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const products = nodes.filter(isProductLike);
  if (products.length === 0) return undefined;
  return products.sort((a, b) => imagesFromNode(b).length - imagesFromNode(a).length)[0];
}

/** Parse JSON-LD blocks and return evidence-shaped product fields. Defensive — never throws. */
export function extractJsonLdFromHtml(html: string): JsonLdExtractionResult {
  const empty: JsonLdExtractionResult = {
    rawItems: [],
    productItems: [],
    imageUrls: [],
    offers: [],
    productGroupHints: [],
    variantRecords: [],
  };

  try {
    const parsed = extractJsonLd(html);
    const flat = flattenJsonLdNodes(parsed);
    const productItems = flat.filter(isProductLike);
    const offers = flat.filter(isOfferLike) as Record<string, unknown>[];
    const productGroupHints = flat.filter((n) =>
      nodeTypes(n).some((t) => t.includes("productgroup"))
    );
    const product = pickBestProduct(flat);

    const result: JsonLdExtractionResult = {
      ...empty,
      rawItems: flat,
      productItems,
      offers,
      productGroupHints,
      variantRecords: product ? variantNodesFromProduct(product) : [],
      imageUrls: product ? imagesFromNode(product) : [],
    };

    if (!product) return result;

    const name = strVal(product.name ?? product.title);
    if (name) {
      result.title = makeFieldEvidence(name, 0.92, "json_ld", {
        quote: name,
        reasons: ["json_ld_product_name"],
      });
    }

    const brand = brandFromNode(product);
    if (brand) {
      result.brand = makeFieldEvidence(brand, 0.9, "json_ld", { quote: brand });
    }

    const mfr = strVal(product.manufacturer);
    if (mfr && mfr !== brand) {
      result.manufacturer = makeFieldEvidence(mfr, 0.88, "json_ld", { quote: mfr });
    }

    const sku = strVal(product.sku ?? product.productID);
    if (sku) {
      result.sku = makeFieldEvidence(sku, 0.93, "json_ld", { quote: sku });
    }

    const mpn = strVal(product.mpn ?? product.gtin13 ?? product.gtin);
    if (mpn) {
      result.mpn = makeFieldEvidence(mpn, 0.9, "json_ld", { quote: mpn });
    }

    const model = strVal(product.model);
    if (model) {
      result.model = makeFieldEvidence(model, 0.85, "json_ld", { quote: model });
    }

    const desc = strVal(product.description);
    if (desc) {
      result.description = makeFieldEvidence(desc.slice(0, 2000), 0.82, "json_ld", {
        quote: desc.slice(0, 200),
      });
    }

    if (result.imageUrls.length === 0) {
      for (const o of offers) {
        result.imageUrls.push(...imagesFromNode(o));
      }
      result.imageUrls = [...new Set(result.imageUrls)];
    }

    return result;
  } catch {
    return empty;
  }
}
