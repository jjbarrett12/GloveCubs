/**
 * Regex-based HTML parsing for product pages (no DOM dependency).
 */

import type { VariantOption } from "./types";

export function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/<[^>]+>/g, "").trim() : null;
}

export function extractMetaTags(html: string): Record<string, string> {
  const meta: Record<string, string> = {};
  const re = /<meta\s+(?:name|property)=["']([^"']+)["'][^>]*content=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) meta[m[1].toLowerCase()] = m[2];
  return meta;
}

export function extractJsonLd(html: string): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim()) as Record<string, unknown> | Record<string, unknown>[];
      if (Array.isArray(parsed)) out.push(...parsed);
      else out.push(parsed);
    } catch {
      /* skip invalid JSON */
    }
  }
  return out;
}

export function extractTables(html: string): Array<{ headers: string[]; rows: string[][] }> {
  const tables: Array<{ headers: string[]; rows: string[][] }> = [];
  const tableRe = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let t: RegExpExecArray | null;
  while ((t = tableRe.exec(html)) !== null) {
    const block = t[1];
    const headers: string[] = [];
    const thRe = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let h: RegExpExecArray | null;
    while ((h = thRe.exec(block)) !== null) headers.push(h[1].replace(/<[^>]+>/g, "").trim());
    const rows: string[][] = [];
    const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let r: RegExpExecArray | null;
    while ((r = trRe.exec(block)) !== null) {
      const row: string[] = [];
      const tdRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;
      let c: RegExpExecArray | null;
      while ((c = tdRe.exec(r[1])) !== null) row.push(c[1].replace(/<[^>]+>/g, "").trim());
      if (row.length) rows.push(row);
    }
    if (headers.length || rows.length) tables.push({ headers, rows });
  }
  return tables;
}

export function extractTextContent(html: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return s;
}

/** Extract product links that might be variants (e.g. size/color selectors). */
export function extractVariantOptions(html: string): VariantOption[] {
  const options: VariantOption[] = [];
  const selectRe = /<select[^>]*name=["']([^"']+)["'][^>]*>([\s\S]*?)<\/select>/gi;
  let m: RegExpExecArray | null;
  while ((m = selectRe.exec(html)) !== null) {
    const name = m[1].toLowerCase();
    const optionsHtml = m[2];
    const values: string[] = [];
    const optRe = /<option[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi;
    let o: RegExpExecArray | null;
    while ((o = optRe.exec(optionsHtml)) !== null) {
      const label = o[2].replace(/<[^>]+>/g, "").trim();
      if (label && !/^(select|choose|--)/i.test(label)) values.push(label);
    }
    if (values.length === 0) continue;
    let dimension: VariantOption["dimension"] = "other";
    if (/size|sizes/.test(name)) dimension = "size";
    else if (/color|colour/.test(name)) dimension = "color";
    else if (/thickness|mil|gauge/.test(name)) dimension = "thickness";
    else if (/pack|box|case|qty/.test(name)) dimension = "packaging";
    options.push({ dimension, values });
  }
  return options;
}

export function extractImages(html: string, baseUrl: string): string[] {
  const urls: string[] = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    try {
      const href = m[1].trim();
      if (href.startsWith("//")) urls.push("https:" + href);
      else if (href.startsWith("/")) urls.push(new URL(href, baseUrl).href);
      else urls.push(new URL(href, baseUrl).href);
    } catch {
      /* skip */
    }
  }
  return [...new Set(urls)];
}
