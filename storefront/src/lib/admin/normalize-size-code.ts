import { normalizeGloveSizeCode } from "@/lib/admin/glove-size-normalization";

const KNOWN_SIZE_CODES = new Set<string>(["XS", "S", "M", "L", "XL", "XXL", "XXXL", "OS", "UNKNOWN"]);

export function normalizeSizeCode(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const upper = t.toUpperCase();
  if (KNOWN_SIZE_CODES.has(upper)) return upper;
  const lower = t.toLowerCase();
  if (/\bone[\s-]?size\b/i.test(lower)) return "OS";
  const glove = normalizeGloveSizeCode(t);
  if (glove) return glove;
  if (/^\d+(\.\d+)?$/.test(t)) return t;
  return upper.length <= 6 ? upper : null;
}
