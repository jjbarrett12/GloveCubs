/**
 * Fail closed when staging/production Supabase refs are crossed.
 * Safe to log project refs; never logs secrets.
 *
 * Usage (Node):
 *   node storefront/scripts/assert-env-isolation.mjs
 *   GC_EXPECTED_ENV=staging node storefront/scripts/assert-env-isolation.mjs
 */

const FORBIDDEN_PRODUCTION_REF = "mnmagwsenzvetwngaszv";
const STAGING_REF = process.env.GC_STAGING_SUPABASE_REF || "fmrupehxifzkpfphiyvm";

function hostFromUrl(raw) {
  try {
    return new URL(String(raw || "").trim()).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function refFromHost(host) {
  const m = String(host || "").match(/^([a-z0-9]+)\.supabase\.co$/i);
  return m ? m[1] : "";
}

export function assertEnvIsolation(env = process.env) {
  const expected = String(env.GC_EXPECTED_ENV || env.VERCEL_ENV || "").toLowerCase();
  const siteUrl = String(env.NEXT_PUBLIC_SITE_URL || "").trim();
  const supabaseUrl = String(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || "").trim();
  const host = hostFromUrl(supabaseUrl);
  const ref = refFromHost(host);

  const errors = [];

  if (!supabaseUrl) errors.push("missing_supabase_url");
  if (!ref) errors.push("unparseable_supabase_ref");

  const looksStaging =
    expected === "staging" ||
    /staging/i.test(siteUrl) ||
    String(env.VERCEL_PROJECT_PRODUCTION_URL || "").includes("staging") ||
    String(env.VERCEL_URL || "").includes("glovecubs-staging");

  if (looksStaging || expected === "staging") {
    if (ref === FORBIDDEN_PRODUCTION_REF) {
      errors.push(`staging_points_at_production_ref:${FORBIDDEN_PRODUCTION_REF}`);
    }
    if (ref && ref !== STAGING_REF) {
      errors.push(`staging_ref_mismatch:expected_${STAGING_REF}_got_${ref}`);
    }
    if (/glovecubs\.com$/i.test(hostFromUrl(siteUrl)) && !/staging/i.test(siteUrl)) {
      errors.push("staging_site_url_looks_production");
    }
  }

  // Never allow production site URL with non-production-looking blank checks on order flags for staging
  if (looksStaging) {
    const orderOn = ["1", "true", "yes", "on"].includes(
      String(env.FEATURE_GC_ORDER_HISTORY || "").trim().toLowerCase(),
    );
    const reorderOn = ["1", "true", "yes", "on"].includes(
      String(env.FEATURE_GC_REORDER_TO_QUOTE || "").trim().toLowerCase(),
    );
    if (orderOn) errors.push("staging_order_history_enabled");
    if (reorderOn) errors.push("staging_reorder_enabled");
    if (env.STRIPE_SECRET_KEY || env.STRIPE_WEBHOOK_SECRET || env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY) {
      errors.push("staging_stripe_keys_present");
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    supabaseHost: host || null,
    supabaseRef: ref || null,
    forbiddenProductionRef: FORBIDDEN_PRODUCTION_REF,
    expectedStagingRef: STAGING_REF,
  };
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("assert-env-isolation.mjs");
if (isMain) {
  const result = assertEnvIsolation(process.env);
  console.log(
    JSON.stringify(
      {
        Environment: process.env.GC_EXPECTED_ENV || process.env.VERCEL_ENV || "unknown",
        "Supabase project ref": result.supabaseRef,
        "Expected production ref forbidden": result.forbiddenProductionRef,
        Result: result.ok ? "PASS" : "FAIL",
        errors: result.errors,
      },
      null,
      2,
    ),
  );
  process.exit(result.ok ? 0 : 1);
}
