/**
 * Re-exports active company resolver (CommonJS) for Next server code.
 * Local dev: resolves `storefront/lib/` (kept in sync with repo-root `lib/` for Express).
 * Vercel builds only `storefront/`, so repo-root `../../../../lib/` is not bundled.
 */
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const m = require("../../../lib/active-company-resolve.js") as {
  resolveActiveCompanyId: (
    userId: string,
    options?: { supabase?: unknown }
  ) => Promise<{
    companyId: string | null;
    reason: string;
    requiresSelection: boolean;
    memberships: string[];
  }>;
  setActiveCompanyForUser: (
    userId: string,
    companyId: string,
    options?: { supabase?: unknown }
  ) => Promise<{ ok: true } | { ok: false; code: string; error: string }>;
  computeActiveCompanyResolution: (params: {
    membershipIdsSorted: string[];
    storedActive: string | null;
  }) => {
    companyId: string | null;
    reason: string;
    requiresSelection: boolean;
    memberships: string[];
    bootstrapCompanyId: string | null;
  };
};

export const resolveActiveCompanyId = m.resolveActiveCompanyId;
export const setActiveCompanyForUser = m.setActiveCompanyForUser;
export const computeActiveCompanyResolution = m.computeActiveCompanyResolution;
