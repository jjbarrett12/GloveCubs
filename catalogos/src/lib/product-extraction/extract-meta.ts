import { extractMetaTags, extractTitle } from "@/lib/openclaw/parse-html";
import { makeFieldEvidence } from "./evidence-helpers";
import type { FieldEvidence } from "./types";

export type MetaExtractionResult = {
  pageTitle?: string;
  metaTitle?: FieldEvidence<string>;
  ogTitle?: FieldEvidence<string>;
  ogImage?: FieldEvidence<string>;
  ogDescription?: FieldEvidence<string>;
  metaDescription?: FieldEvidence<string>;
  canonicalUrl?: string;
  h1Candidates: FieldEvidence<string>[];
  openGraph: Record<string, string>;
};

function extractCanonicalUrl(html: string, pageUrl: string): string | undefined {
  const m = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i);
  if (!m?.[1]) return undefined;
  try {
    const href = m[1].trim();
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    return new URL(href, pageUrl).href;
  } catch {
    return undefined;
  }
}

function extractH1Candidates(html: string): FieldEvidence<string>[] {
  const out: FieldEvidence<string>[] = [];
  const re = /<h1[^>]*>([\s\S]*?)<\/h1>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const text = m[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text || text.length < 3) continue;
    out.push(
      makeFieldEvidence(text, 0.88, "h1", {
        selector: "h1",
        quote: text.slice(0, 200),
      })
    );
  }
  return out;
}

/** Extract page meta, OpenGraph, canonical, and H1 candidates. */
export function extractMetaFromHtml(html: string, pageUrl: string): MetaExtractionResult {
  const meta = extractMetaTags(html);
  const pageTitle = extractTitle(html) ?? undefined;
  const openGraph: Record<string, string> = {};

  for (const [k, v] of Object.entries(meta)) {
    if (k.startsWith("og:") || k === "twitter:title" || k === "twitter:image") {
      openGraph[k] = v;
    }
  }

  const ogTitle = meta["og:title"]?.trim();
  const ogImage = meta["og:image"]?.trim();
  const ogDescription = meta["og:description"]?.trim();
  const metaDescription = meta["description"]?.trim();

  return {
    pageTitle,
    metaTitle: pageTitle
      ? makeFieldEvidence(pageTitle, 0.75, "title", { quote: pageTitle.slice(0, 200) })
      : undefined,
    ogTitle: ogTitle
      ? makeFieldEvidence(ogTitle, 0.8, "open_graph", { quote: ogTitle.slice(0, 200) })
      : undefined,
    ogImage: ogImage
      ? makeFieldEvidence(ogImage, 0.78, "open_graph", { url: ogImage, quote: ogImage })
      : undefined,
    ogDescription: ogDescription
      ? makeFieldEvidence(ogDescription, 0.72, "open_graph", { quote: ogDescription.slice(0, 200) })
      : undefined,
    metaDescription: metaDescription
      ? makeFieldEvidence(metaDescription, 0.7, "meta", { quote: metaDescription.slice(0, 200) })
      : undefined,
    canonicalUrl: extractCanonicalUrl(html, pageUrl),
    h1Candidates: extractH1Candidates(html),
    openGraph,
  };
}
