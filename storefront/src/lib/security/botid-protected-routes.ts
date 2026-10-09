/**
 * Client BotID protect list — must match routes that call requireHumanBotId().
 * If a path is missing here, checkBotId() will fail closed (treated as bot).
 */
export const BOTID_PROTECTED_ROUTES = [
  { path: "/api/leads/request-pricing", method: "POST" },
  { path: "/api/quote-request", method: "POST" },
  { path: "/api/contact", method: "POST" },
  { path: "/api/invoice/intake", method: "POST" },
  { path: "/api/auth/self-signup/finalize", method: "POST" },
  { path: "/api/gloves/recommend", method: "POST" },
  { path: "/api/ai/glove-finder", method: "POST" },
] as const;
