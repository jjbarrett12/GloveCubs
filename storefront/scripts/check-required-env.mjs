/**
 * Fail before dev/build/deploy when required Supabase login env is missing or blank.
 * Treats undefined, null, "", whitespace-only, and quoted empty strings as invalid.
 *
 * Usage:
 *   node scripts/check-required-env.mjs           # local: process.env + env files
 *   node scripts/check-required-env.mjs --deploy  # deploy gate: process.env only
 */
import {
  formatLoginEnvReport,
  resolveEffectiveLoginEnv,
  validateRequiredLoginEnv,
} from "./env-file-utils.mjs";

const deployOnly = process.argv.includes("--deploy");

function main() {
  const resolved = resolveEffectiveLoginEnv({ deployOnly });
  const problems = validateRequiredLoginEnv(resolved);

  if (problems.length === 0) {
    console.log(formatLoginEnvReport(resolved, { ok: true, deployOnly }));
    process.exit(0);
  }

  console.error(formatLoginEnvReport(problems, { ok: false, deployOnly }));
  process.exit(1);
}

main();
