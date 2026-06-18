/**
 * Safe env audit — prints presence/length/masked preview only. No full secret values.
 * Usage: node scripts/audit-env-safe.mjs [optional-env-file...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_ENV_FILE_PATHS,
  envKeyStatus,
  maskEnvValue,
  mergeEnvFileVars,
  parseEnvFile,
  REQUIRED_LOGIN_ENV_KEYS,
  resolveEffectiveLoginEnv,
  validateRequiredLoginEnv,
} from "./env-file-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefrontRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(storefrontRoot, "..");

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "NEXT_PUBLIC_SITE_URL",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_SUPABASE_URL",
  "NEXT_SUPABASE_ANON_KEY",
];

const WRONG_NAMES = [
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "NEXT_SUPABASE_URL",
  "NEXT_SUPABASE_ANON_KEY",
];

function auditFile(filePath) {
  const rel = path.relative(repoRoot, filePath);
  const parsed = parseEnvFile(filePath);
  if (parsed.error) {
    console.log(`\n=== ${rel} ===`);
    console.log(`  ERROR: ${parsed.error.message || parsed.error}`);
    return;
  }
  const stat = fs.statSync(filePath);
  console.log(`\n=== ${rel} ===`);
  console.log(`  size=${stat.size} mtime=${stat.mtime.toISOString()}`);
  for (const key of KEYS) {
    const raw = parsed.vars[key];
    const status = envKeyStatus(raw);
    const m = maskEnvValue(key, raw ?? "");
    const flags = [];
    if (status === "ok" && /^\s|\s$/.test(String(raw))) flags.push("leading/trailing-space");
    console.log(`  ${key}: status=${status} masked=${m}${flags.length ? ` flags=[${flags.join(",")}]` : ""}`);
  }
}

const defaultFiles = DEFAULT_ENV_FILE_PATHS;
const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles;
console.log(`Repo root: ${repoRoot}`);
console.log(`Next.js root: ${storefrontRoot}`);
console.log(`CWD: ${process.cwd()}`);

for (const f of files) {
  if (fs.existsSync(f)) auditFile(f);
  else console.log(`\n=== ${path.relative(repoRoot, f)} === MISSING`);
}

const merged = mergeEnvFileVars(defaultFiles);
const resolvedUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || merged.NEXT_PUBLIC_SUPABASE_URL || merged.SUPABASE_URL || "";
const resolvedAnon =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
  merged.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  merged.SUPABASE_ANON_KEY ||
  "";
const resolvedService = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || merged.SUPABASE_SERVICE_ROLE_KEY || "";

console.log("\n=== effective login env (safe) ===");
for (const spec of REQUIRED_LOGIN_ENV_KEYS) {
  const row = resolveEffectiveLoginEnv({ envFilePaths: defaultFiles })[spec.key];
  const hostPart = row.hostname ? ` host=${row.hostname}` : "";
  console.log(`  ${spec.key}: status=${row.status} (${spec.visibility}) source=${row.source}${hostPart}`);
}
const problems = validateRequiredLoginEnv(resolveEffectiveLoginEnv({ envFilePaths: defaultFiles }));
console.log(`  login_ready=${problems.length === 0}`);

console.log("\n=== next.config.mjs merge simulation ===");
console.log(`  resolved NEXT_PUBLIC_SUPABASE_URL: ${maskEnvValue("NEXT_PUBLIC_SUPABASE_URL", resolvedUrl)}`);
console.log(`  resolved NEXT_PUBLIC_SUPABASE_ANON_KEY: ${maskEnvValue("NEXT_PUBLIC_SUPABASE_ANON_KEY", resolvedAnon)}`);
console.log(`  resolved SUPABASE_SERVICE_ROLE_KEY: ${maskEnvValue("SUPABASE_SERVICE_ROLE_KEY", resolvedService)}`);
console.log(`  login would be configured: ${Boolean(resolvedUrl && resolvedAnon && resolvedService)}`);

console.log("\n=== common mistakes (non-empty wrong-name keys) ===");
for (const f of defaultFiles) {
  if (!fs.existsSync(f)) continue;
  const { vars } = parseEnvFile(f);
  for (const key of WRONG_NAMES) {
    const v = vars[key];
    if (envKeyStatus(v) === "ok") {
      console.log(`  ${path.relative(repoRoot, f)} has ${key} — needs NEXT_PUBLIC_* for browser`);
    }
  }
}

console.log("\n=== vercel env pull warning ===");
console.log("  Blank NEXT_PUBLIC_SUPABASE_* values in pulled files are invalid. Run npm run env:check after pull.");
