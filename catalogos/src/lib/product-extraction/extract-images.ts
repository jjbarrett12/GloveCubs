import { createHash } from "node:crypto";
import { makeFieldEvidence, trustFromConfidence } from "./evidence-helpers";
import type {
  FieldEvidence,
  ProductImageCandidate,
  ProductImageRole,
  ProductImageSource,
} from "./types";

export type ImageExtractionInput = {
  html: string;
  pageUrl: string;
  jsonLdImageUrls?: string[];
  ogImageUrl?: string;
  parsedImageUrls?: string[];
};

export type ImageExtractionResult = {
  candidates: ProductImageCandidate[];
  primaryCandidateId?: string;
  rejected: ProductImageCandidate[];
};

const LOGO_HINT = /\b(logo|brand-mark|site-icon|favicon|sprite|payment|visa|mastercard|paypal|facebook|twitter|instagram|linkedin|pinterest|youtube|apple-pay|google-pay|badge|icon|banner|hero-bg|tracking|pixel|spacer|blank|placeholder)\b/i;
const LIFESTYLE_HINT = /\b(lifestyle|hero|banner|scene|stock-photo|background)\b/i;
const SWATCH_HINT = /\b(swatch|color-chip|variant-image|option-image)\b/i;
const GALLERY_HINT = /\b(gallery|product-image|product__media|zoom|main-image|primary-image|pdp-image)\b/i;
const PACKAGING_HINT = /\b(packaging|case|carton|box-pack)\b/i;
const SPEC_DIAGRAM_HINT = /\b(diagram|spec|technical|cutaway|chart)\b/i;

const PRODUCT_ALT_HINT =
  /\b(glove|nitrile|latex|vinyl|neoprene|exam|disposable|reusable|size|small|medium|large|blue|black|white|clear|proworks|hospeco)\b/i;

function imageId(normalizedUrl: string): string {
  return createHash("sha256").update(normalizedUrl).digest("hex").slice(0, 16);
}

function resolveAbsoluteUrl(raw: string, baseUrl: string): string | null {
  try {
    const href = raw.trim();
    if (!href || href.startsWith("data:")) return null;
    if (href.startsWith("//")) return "https:" + href;
    if (href.startsWith("http://") || href.startsWith("https://")) return href;
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

function normalizeImageUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

function parseSrcset(srcset: string, baseUrl: string): string[] {
  const urls: string[] = [];
  for (const part of srcset.split(",")) {
    const url = part.trim().split(/\s+/)[0];
    if (!url) continue;
    const abs = resolveAbsoluteUrl(url, baseUrl);
    if (abs) urls.push(abs);
  }
  return urls;
}

type RawImage = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
  source: ProductImageSource;
  context: string;
};

function collectRawImages(html: string, pageUrl: string, input: ImageExtractionInput): RawImage[] {
  const raw: RawImage[] = [];

  for (const url of input.jsonLdImageUrls ?? []) {
    const abs = resolveAbsoluteUrl(url, pageUrl);
    if (abs) raw.push({ url: abs, source: "json_ld", context: "json_ld" });
  }

  if (input.ogImageUrl) {
    const abs = resolveAbsoluteUrl(input.ogImageUrl, pageUrl);
    if (abs) raw.push({ url: abs, source: "og_image", context: "og_image" });
  }

  for (const url of input.parsedImageUrls ?? []) {
    const abs = resolveAbsoluteUrl(url, pageUrl);
    if (abs) raw.push({ url: abs, source: "img", context: "parsed" });
  }

  const imgRe = /<img([^>]+)>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null) {
    const attrs = m[1] ?? "";
    const srcM = attrs.match(/\bsrc=["']([^"']+)["']/i);
    const altM = attrs.match(/\balt=["']([^"']*)["']/i);
    const wM = attrs.match(/\bwidth=["']?(\d+)/i);
    const hM = attrs.match(/\bheight=["']?(\d+)/i);
    const classM = attrs.match(/\bclass=["']([^"']+)["']/i);
    const context = [classM?.[1], altM?.[1]].filter(Boolean).join(" ");
    const source: ProductImageSource = /gallery|product|media/i.test(context) ? "gallery" : "img";

    if (srcM?.[1]) {
      const abs = resolveAbsoluteUrl(srcM[1], pageUrl);
      if (abs) {
        raw.push({
          url: abs,
          alt: altM?.[1],
          width: wM ? parseInt(wM[1]!, 10) : undefined,
          height: hM ? parseInt(hM[1]!, 10) : undefined,
          source,
          context,
        });
      }
    }

    const srcsetM = attrs.match(/\bsrcset=["']([^"']+)["']/i);
    if (srcsetM?.[1]) {
      for (const u of parseSrcset(srcsetM[1], pageUrl)) {
        raw.push({ url: u, alt: altM?.[1], source: "srcset", context });
      }
    }
  }

  const pictureRe = /<picture[^>]*>([\s\S]*?)<\/picture>/gi;
  while ((m = pictureRe.exec(html)) !== null) {
    const block = m[1] ?? "";
    const srcM = block.match(/\bsrc=["']([^"']+)["']/i);
    if (srcM?.[1]) {
      const abs = resolveAbsoluteUrl(srcM[1], pageUrl);
      if (abs) raw.push({ url: abs, source: "picture", context: block.slice(0, 120) });
    }
  }

  return raw;
}

function classifyRole(raw: RawImage): ProductImageRole {
  const hay = `${raw.url} ${raw.alt ?? ""} ${raw.context}`.toLowerCase();
  if (LOGO_HINT.test(hay)) return "logo";
  if (SWATCH_HINT.test(hay)) return "variant_swatch";
  if (PACKAGING_HINT.test(hay)) return "packaging";
  if (SPEC_DIAGRAM_HINT.test(hay)) return "spec_diagram";
  if (LIFESTYLE_HINT.test(hay)) return "lifestyle";
  if (/\bbadge\b/i.test(hay)) return "badge";
  if (raw.source === "json_ld" || raw.source === "og_image") return "primary_product";
  if (GALLERY_HINT.test(hay)) return "primary_product";
  if (PRODUCT_ALT_HINT.test(hay)) return "alternate_product";
  return "unknown";
}

function scoreImage(raw: RawImage, role: ProductImageRole): { score: number; reasons: string[] } {
  let score = 0.4;
  const reasons: string[] = [];

  if (raw.source === "json_ld") {
    score += 0.35;
    reasons.push("json_ld_image");
  } else if (raw.source === "og_image") {
    score += 0.3;
    reasons.push("og_image");
  } else if (raw.source === "gallery" || raw.source === "picture") {
    score += 0.2;
    reasons.push("gallery_or_picture");
  }

  const w = raw.width ?? 0;
  const h = raw.height ?? 0;
  if (w >= 400 || h >= 400) {
    score += 0.15;
    reasons.push("large_dimensions");
  } else if (w > 0 && w < 80) {
    score -= 0.25;
    reasons.push("tiny_image");
  }

  if (raw.alt && PRODUCT_ALT_HINT.test(raw.alt)) {
    score += 0.12;
    reasons.push("product_alt_text");
  }

  if (role === "primary_product" || role === "alternate_product") {
    score += 0.1;
    reasons.push("product_role");
  } else if (role === "logo" || role === "badge") {
    score -= 0.45;
    reasons.push("logo_or_badge");
  } else if (role === "lifestyle") {
    score -= 0.2;
    reasons.push("lifestyle");
  } else if (role === "variant_swatch") {
    score -= 0.05;
    reasons.push("swatch");
  }

  if (LOGO_HINT.test(raw.url)) {
    score -= 0.35;
    reasons.push("logo_url_pattern");
  }

  return { score: Math.max(0, Math.min(1, score)), reasons };
}

function variantHintsFromAlt(alt?: string): ProductImageCandidate["variantHints"] | undefined {
  if (!alt) return undefined;
  const hints: NonNullable<ProductImageCandidate["variantHints"]> = {};
  const sizeM = alt.match(/\b(XS|S|M|L|XL|XXL|2XL|3XL|X-Small|Small|Medium|Large|X-Large)\b/i);
  if (sizeM) hints.size = sizeM[1];
  const colorM = alt.match(/\b(blue|black|white|clear|violet|orange|green)\b/i);
  if (colorM) hints.color = colorM[1];
  return Object.keys(hints).length ? hints : undefined;
}

/** Collect, dedupe, classify, and score product image candidates. */
export function extractImagesFromHtml(input: ImageExtractionInput): ImageExtractionResult {
  const rawImages = collectRawImages(input.html, input.pageUrl, input);
  const byUrl = new Map<string, RawImage>();

  for (const raw of rawImages) {
    const normalized = normalizeImageUrl(raw.url);
    if (!byUrl.has(normalized)) byUrl.set(normalized, raw);
  }

  const candidates: ProductImageCandidate[] = [];
  const rejected: ProductImageCandidate[] = [];

  for (const [normalized, raw] of byUrl) {
    const role = classifyRole(raw);
    const { score, reasons } = scoreImage(raw, role);
    const confidence = score;
    const trust = trustFromConfidence(confidence);
    const candidate: ProductImageCandidate = {
      id: imageId(normalized),
      url: raw.url,
      absoluteUrl: normalized,
      alt: raw.alt,
      width: raw.width,
      height: raw.height,
      source: raw.source,
      role,
      score,
      confidence,
      trust,
      reasons,
      variantHints: variantHintsFromAlt(raw.alt),
    };

    if (role === "logo" || role === "badge" || score < 0.25) {
      rejected.push(candidate);
    } else {
      candidates.push(candidate);
    }
  }

  candidates.sort((a, b) => b.score - a.score);

  const productLike = candidates.filter(
    (c) => c.role === "primary_product" || c.role === "alternate_product" || c.role === "unknown"
  );
  const primaryPool = productLike.length ? productLike : candidates;
  const primaryCandidateId = primaryPool[0]?.id;

  if (primaryCandidateId) {
    const idx = candidates.findIndex((c) => c.id === primaryCandidateId);
    if (idx >= 0) {
      candidates[idx] = {
        ...candidates[idx]!,
        role: candidates[idx]!.role === "unknown" ? "primary_product" : candidates[idx]!.role,
      };
    }
  }

  return { candidates, primaryCandidateId, rejected };
}

export function ogImageUrlFromEvidence(og?: FieldEvidence<string>): string | undefined {
  return og?.value?.trim() || og?.url?.trim() || undefined;
}
