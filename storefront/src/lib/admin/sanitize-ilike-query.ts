/** Strip PostgREST ilike metacharacters and commas from operator search text. */
export function sanitizeIlikeQuery(raw: string, maxLen = 80): string {
  return raw
    .trim()
    .replace(/[%_,]/g, "")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .slice(0, maxLen)
    .trim();
}
