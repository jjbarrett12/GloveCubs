// Base URL for the main GloveCubs Express API (glove-finder, invoice, etc.).
// Set NEXT_PUBLIC_GLOVECUBS_API in .env (e.g. http://localhost:3004).
export function getApiBase(): string {
  if (typeof window !== "undefined") {
    return process.env.NEXT_PUBLIC_GLOVECUBS_API ?? "";
  }
  return process.env.NEXT_PUBLIC_GLOVECUBS_API ?? "";
}
