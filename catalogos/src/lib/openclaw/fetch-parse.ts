/**
 * OpenClaw Step 2: Fetch and parse product pages into structured data.
 */

import { safeFetchHtml } from "./fetch";
import {
  extractTitle,
  extractMetaTags,
  extractJsonLd,
  extractTables,
  extractTextContent,
  extractVariantOptions,
  extractImages,
  extractSpecSheetUrls,
} from "./parse-html";
import { OPENCLAW_CONFIG } from "./config";
import type { FetchedProductPage, ParsedProductPage } from "./types";

function tableToRecord(tables: Array<{ headers: string[]; rows: string[][] }>): Record<string, string> | undefined {
  for (const { headers, rows } of tables) {
    if (headers.length === 0) continue;
    const spec: Record<string, string> = {};
    for (const row of rows) {
      const key = (row[0] ?? "").trim().toLowerCase();
      const val = (row[1] ?? row[0] ?? "").trim();
      if (key) spec[key] = val;
    }
    if (Object.keys(spec).length > 0) return spec;
  }
  return undefined;
}

function specFromJsonLd(items: Record<string, unknown>[]): Record<string, string> | undefined {
  for (const item of items) {
    const type = String(item["@type"] ?? "").toLowerCase();
    if (!type.includes("product")) continue;
    const spec: Record<string, string> = {};
    const map: [string, string][] = [
      ["name", "product_title"],
      ["sku", "sku"],
      ["gtin", "upc"],
      ["description", "description"],
    ];
    for (const [ldKey, outKey] of map) {
      const v = item[ldKey];
      if (v != null) spec[outKey] = String(v);
    }
    if (item.brand && typeof item.brand === "object" && item.brand !== null) {
      const b = (item.brand as Record<string, unknown>).name;
      if (b != null) spec["brand"] = String(b);
    }
    if (Object.keys(spec).length > 0) return spec;
  }
  return undefined;
}

export async function fetchAndParsePage(url: string): Promise<{
  fetched: FetchedProductPage;
  parsed: ParsedProductPage | null;
}> {
  const fetched: FetchedProductPage = await safeFetchHtml(url).then((r) => ({
    url: r.url,
    final_url: r.final_url,
    html: r.html ?? "",
    content_type: r.content_type,
    fetch_time_ms: r.fetch_time_ms,
    error: r.error,
  }));

  if (!fetched.html) {
    return { fetched, parsed: null };
  }

  const pageTitle = extractTitle(fetched.html);
  const meta = extractMetaTags(fetched.html);
  const jsonLd = extractJsonLd(fetched.html);
  const tables = extractTables(fetched.html);
  const text = extractTextContent(fetched.html);
  const variantOptions = extractVariantOptions(fetched.html);
  const images = extractImages(fetched.html, url);
  const specSheetUrls = extractSpecSheetUrls(fetched.html, url);

  const productTitle =
    pageTitle ??
    meta["og:title"] ??
    meta["twitter:title"] ??
    (jsonLd.length > 0 && jsonLd[0].name ? String(jsonLd[0].name) : undefined);
  const specTable = tableToRecord(tables) ?? specFromJsonLd(jsonLd);
  const description = meta["description"] ?? meta["og:description"] ?? undefined;
  const breadcrumbs = meta["breadcrumb"] ? [meta["breadcrumb"]] : [];

  const parsed: ParsedProductPage = {
    url,
    page_title: pageTitle ?? undefined,
    product_title: productTitle ?? undefined,
    description: description ?? undefined,
    spec_table: specTable,
    breadcrumbs: breadcrumbs.length ? breadcrumbs : undefined,
    variant_options: variantOptions.length > 0 ? variantOptions : undefined,
    json_ld: jsonLd.length > 0 ? jsonLd : undefined,
    images: images.length > 0 ? images : undefined,
    spec_sheet_urls: specSheetUrls.length > 0 ? specSheetUrls : undefined,
    raw_html_snippet: text.slice(0, 2000),
  };

  if (specTable) {
    if (specTable.sku) parsed.sku = specTable.sku;
    if (specTable.mpn || specTable["mpn"] || specTable["part number"]) parsed.mpn = specTable.mpn ?? specTable["mpn"] ?? specTable["part number"];
    if (specTable.upc || specTable.gtin) parsed.upc = specTable.upc ?? specTable.gtin;
    if (specTable.brand) parsed.brand = specTable.brand;
  }
  if (jsonLd.length > 0) {
    const p = jsonLd.find((x) => String(x["@type"] ?? "").toLowerCase().includes("product")) as Record<string, unknown> | undefined;
    if (p) {
      if (p.sku && !parsed.sku) parsed.sku = String(p.sku);
      if (p.gtin12 || p.gtin13 || p.gtin) parsed.upc = String(p.gtin12 ?? p.gtin13 ?? p.gtin ?? "");
      if (p.brand && typeof p.brand === "object" && p.brand !== null)
        parsed.brand = String((p.brand as Record<string, unknown>).name ?? "");
    }
  }

  return { fetched, parsed };
}

export async function fetchAndParsePages(
  urls: string[]
): Promise<Array<{ url: string; fetched: FetchedProductPage; parsed: ParsedProductPage | null }>> {
  const max = Math.min(urls.length, OPENCLAW_CONFIG.max_pages_to_fetch);
  const results: Array<{ url: string; fetched: FetchedProductPage; parsed: ParsedProductPage | null }> = [];
  for (let i = 0; i < max; i++) {
    const url = urls[i];
    const { fetched, parsed } = await fetchAndParsePage(url);
    results.push({ url, fetched, parsed });
    if (i < max - 1) await new Promise((r) => setTimeout(r, OPENCLAW_CONFIG.delay_between_fetches_ms));
  }
  return results;
}
