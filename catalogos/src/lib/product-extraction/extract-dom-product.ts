import {
  extractSpecSheetUrls,
  extractTables,
  extractTextContent,
} from "@/lib/openclaw/parse-html";
import { makeFieldEvidence } from "./evidence-helpers";
import type { FieldEvidence } from "./types";

export type DomProductExtractionResult = {
  titleCandidates: FieldEvidence<string>[];
  bullets?: FieldEvidence<string[]>;
  specTable: Record<string, string>;
  description?: FieldEvidence<string>;
  rawTextSample: string;
  documents: {
    specSheetUrls: string[];
    sdsUrls: string[];
    otherUrls: string[];
  };
};

const PRODUCT_TITLE_SELECTORS = [
  /<[^>]+class=["'][^"']*(?:product[-_]title|product__title|entry-title)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
  /<[^>]+itemprop=["']name["'][^>]*>([\s\S]*?)<\/[^>]+>/gi,
];

const SDS_HINT = /\b(sds|msds|safety\s*data\s*sheet)\b/i;
const SPEC_HINT = /\b(spec(?:ification)?|data\s*sheet|tds|technical)\b/i;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractTitleCandidates(html: string): FieldEvidence<string>[] {
  const out: FieldEvidence<string>[] = [];
  for (const re of PRODUCT_TITLE_SELECTORS) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const text = stripTags(m[1] ?? "");
      if (text.length < 3) continue;
      out.push(
        makeFieldEvidence(text, 0.82, "dom", {
          selector: "product-title",
          quote: text.slice(0, 200),
        })
      );
    }
  }
  return out;
}

function extractBulletLists(html: string): string[] {
  const bullets: string[] = [];
  const ulRe = /<ul[^>]*>([\s\S]*?)<\/ul>/gi;
  let ul: RegExpExecArray | null;
  while ((ul = ulRe.exec(html)) !== null) {
    const block = ul[1];
    if (!/product|detail|feature|spec|description/i.test(ul[0] ?? block.slice(0, 120))) {
      if (bullets.length > 0) continue;
    }
    const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let li: RegExpExecArray | null;
    while ((li = liRe.exec(block)) !== null) {
      const text = stripTags(li[1] ?? "");
      if (text.length >= 3) bullets.push(text);
    }
  }
  return bullets;
}

function tablesToSpecRecord(
  tables: Array<{ headers: string[]; rows: string[][] }>
): Record<string, string> {
  const spec: Record<string, string> = {};
  for (const { headers, rows } of tables) {
    for (const row of rows) {
      const key = (row[0] ?? "").trim().toLowerCase();
      const val = (row[1] ?? row[0] ?? "").trim();
      if (key && val) spec[key] = val;
    }
    if (headers.length >= 2 && rows.length === 0) {
      for (let i = 0; i < headers.length - 1; i += 2) {
        const k = headers[i]?.trim().toLowerCase();
        const v = headers[i + 1]?.trim();
        if (k && v) spec[k] = v;
      }
    }
  }
  return spec;
}

function extractDescriptionBlock(html: string): FieldEvidence<string> | undefined {
  const patterns = [
    /<[^>]+class=["'][^"']*(?:product[-_]description|description|product__description)[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/i,
    /<div[^>]+id=["']description["'][^>]*>([\s\S]*?)<\/div>/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (!m?.[1]) continue;
    const text = stripTags(m[1]);
    if (text.length >= 20) {
      return makeFieldEvidence(text.slice(0, 4000), 0.75, "dom", {
        selector: "description",
        quote: text.slice(0, 200),
      });
    }
  }
  return undefined;
}

function classifyDocumentUrls(urls: string[]): DomProductExtractionResult["documents"] {
  const specSheetUrls: string[] = [];
  const sdsUrls: string[] = [];
  const otherUrls: string[] = [];

  for (const u of urls) {
    const lower = u.toLowerCase();
    if (SDS_HINT.test(lower)) sdsUrls.push(u);
    else if (SPEC_HINT.test(lower) || /\.pdf(?:[?#]|$)/i.test(lower)) specSheetUrls.push(u);
    else otherUrls.push(u);
  }

  return {
    specSheetUrls: [...new Set(specSheetUrls)],
    sdsUrls: [...new Set(sdsUrls)],
    otherUrls: [...new Set(otherUrls)],
  };
}

/** Extract DOM product regions, bullets, spec tables, descriptions, and document links. */
export function extractDomProductFromHtml(html: string, pageUrl: string): DomProductExtractionResult {
  const tables = extractTables(html);
  const specTable = tablesToSpecRecord(tables);
  const bullets = extractBulletLists(html);
  const allDocUrls = extractSpecSheetUrls(html, pageUrl);
  const rawText = extractTextContent(html);

  return {
    titleCandidates: extractTitleCandidates(html),
    bullets: bullets.length
      ? makeFieldEvidence(bullets, 0.78, "bullet", { reasons: [`${bullets.length} bullet items`] })
      : undefined,
    specTable,
    description: extractDescriptionBlock(html),
    rawTextSample: rawText.slice(0, 4000),
    documents: classifyDocumentUrls(allDocUrls),
  };
}
