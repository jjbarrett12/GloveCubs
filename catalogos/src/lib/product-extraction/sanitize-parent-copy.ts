import { normalizeGloveSizeCode } from "@glove-sku-intelligence";

export type SanitizeParentCopyInput = {
  title?: string;
  description?: string;
  bullets?: string[];
  selectedSize?: string;
  availableSizes?: string[];
  preserveBlocks?: string[];
};

export type SanitizeParentCopyResult = {
  title?: string;
  description?: string;
  bullets?: string[];
  removedTokens: string[];
  confidence: number;
};

const SIZE_TOKEN_ALIASES: Record<string, string[]> = {
  XS: ["XS", "X-Small", "X Small", "Extra Small"],
  S: ["S", "SM", "Small"],
  M: ["M", "MD", "Medium"],
  L: ["L", "LG", "Large"],
  X: ["X"],
  XL: ["XL", "X-Large", "X Large", "Extra Large"],
  XXL: ["XXL", "2XL", "XX-Large", "Extra Extra Large"],
  XXXL: ["XXXL", "3XL", "XXX-Large"],
};

const PROTECTED_COPY_RES = [
  /\bavailable\s+in\s+sizes?\b/i,
  /\bsizes?\s*:\s*[A-Z0-9,\s/|–—-]+/i,
  /\bsize\s+chart\b/i,
  /\b\d+\s*x\s*\d+\b/i,
  /\b\d+\s*(?:boxes?|bx)\b/i,
  /\bcase\s+\d[\d,]*\s*ct\b/i,
  /\b\d[\d,]*\s*(?:gloves?|units?)\b/i,
  /\b\d+(?:\.\d+)?\s*mil\b/i,
  /\b\d+(?:\.\d+)?\s*(?:inch|in)\b/i,
  /\b\d+\s*in\s+length\b/i,
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function canonicalSelectedSize(selectedSize?: string): string | undefined {
  if (!selectedSize?.trim()) return undefined;
  const code = normalizeGloveSizeCode(selectedSize);
  if (code) return code;
  const upper = selectedSize.trim().toUpperCase();
  return upper === "X" ? "X" : undefined;
}

function tokensForSelectedSize(selectedSize: string): string[] {
  const code = canonicalSelectedSize(selectedSize);
  if (!code) {
    if (/^(0[7-9]|1[0-3])$/.test(selectedSize.trim())) return [selectedSize.trim()];
    return [];
  }
  const aliases = SIZE_TOKEN_ALIASES[code] ?? [code];
  return [...new Set([code, ...aliases])].sort((a, b) => b.length - a.length);
}

function isAvailableSizesListing(text: string): boolean {
  return /\bavailable\s+in\s+sizes?\b/i.test(text) || /\bsizes?\s*:\s*/i.test(text);
}

function isProtectedStandaloneCopy(text: string): boolean {
  const t = text.trim();
  if (isAvailableSizesListing(t)) return true;
  if (t.length > 48) return false;
  return PROTECTED_COPY_RES.some((re) => re.test(t));
}

function stripSelectedSizeFromText(
  text: string,
  tokens: string[],
  opts: { allowInline?: boolean } = {}
): { text: string; removed: string[] } {
  if (!text.trim() || isAvailableSizesListing(text) || isProtectedStandaloneCopy(text)) {
    return { text: text.trim(), removed: [] };
  }

  let result = text.trim();
  const removed: string[] = [];

  for (const token of tokens) {
    const esc = escapeRegExp(token);
    const patterns: RegExp[] = [
      new RegExp(`[,|/–—-]\\s*${esc}\\s*$`, "i"),
      new RegExp(`\\s[-–—]\\s*${esc}\\s*$`, "i"),
      new RegExp(`\\bsize\\s*[:\\-]?\\s*${esc}\\b`, "i"),
    ];
    if (opts.allowInline !== false) {
      patterns.push(new RegExp(`\\s+${esc}\\s*$`, "i"));
    }

    for (const re of patterns) {
      const match = result.match(re);
      if (!match) continue;
      const next = result
        .replace(re, "")
        .replace(/\s+/g, " ")
        .replace(/[,|/–—-]\s*$/, "")
        .trim();
      if (next.length >= 8 && next.length < result.length) {
        result = next;
        removed.push(token);
        break;
      }
    }
  }

  return { text: result, removed };
}

function sanitizeField(
  value: string | undefined,
  tokens: string[],
  opts?: { allowInline?: boolean }
): { value?: string; removed: string[] } {
  if (!value?.trim()) return { value, removed: [] };
  const { text, removed } = stripSelectedSizeFromText(value, tokens, opts);
  if (!removed.length) return { value: value.trim(), removed: [] };
  return { value: text, removed };
}

/** Remove selected-size markers from parent title/description while preserving size listings and packaging copy. */
export function sanitizeParentCopy(input: SanitizeParentCopyInput): SanitizeParentCopyResult {
  const selected = input.selectedSize?.trim();
  if (!selected) {
    return {
      title: input.title?.trim() || undefined,
      description: input.description?.trim() || undefined,
      bullets: input.bullets,
      removedTokens: [],
      confidence: 0,
    };
  }

  const tokens = tokensForSelectedSize(selected);
  if (tokens.length === 0) {
    return {
      title: input.title?.trim() || undefined,
      description: input.description?.trim() || undefined,
      bullets: input.bullets,
      removedTokens: [],
      confidence: 0,
    };
  }

  const titleResult = sanitizeField(input.title, tokens);
  const descriptionResult = sanitizeField(input.description, tokens, { allowInline: false });

  const bullets =
    input.bullets?.map((bullet) => sanitizeField(bullet, tokens, { allowInline: false }).value ?? bullet) ??
    undefined;

  const removedTokens = [...new Set([...titleResult.removed, ...descriptionResult.removed])];
  const confidence = removedTokens.length > 0 ? 0.86 : 0.45;

  return {
    title: titleResult.value,
    description: descriptionResult.value,
    bullets,
    removedTokens,
    confidence,
  };
}
