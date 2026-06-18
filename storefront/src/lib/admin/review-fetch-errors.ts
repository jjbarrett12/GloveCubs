export type ReviewFetchArea = "unified_queue" | "clipboard_queue" | "categories";

export type ReviewFetchWarning = {
  area: ReviewFetchArea;
  code: string;
  message: string;
};

const SECRET_PATTERNS = [
  /service[_-]?role/i,
  /eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/,
  /sb_[a-zA-Z0-9_-]+/,
  /password/i,
  /secret/i,
  /apikey/i,
];

export function sanitizeReviewFetchMessage(raw: string): string {
  const trimmed = raw.trim().slice(0, 240);
  if (!trimmed) return "Review data could not be loaded.";
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(trimmed)) return "Review data could not be loaded.";
  }
  return trimmed;
}

export function classifyReviewFetchError(area: ReviewFetchArea, err: unknown): ReviewFetchWarning {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "Review data could not be loaded.";
  const message = sanitizeReviewFetchMessage(raw);
  const code =
    err instanceof Error && "code" in err && typeof err.code === "string"
      ? err.code
      : "fetch_failed";
  return { area, code, message };
}
