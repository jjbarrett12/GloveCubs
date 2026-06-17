/**
 * Safe env audit — prints presence/length/masked preview only. No full secrets.
 * Usage: node scripts/audit-env-safe.mjs [optional-env-file...]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

function parseEnvFile(filePath) {
  const out = {};
  try {
    for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      out[key] = val;
    }
  } catch (e) {
    return { error: String(e.message || e), vars: {} };
  }
  return { error: null, vars: out };
}

function mask(val, highlySensitive = false) {
  if (val == null || val === "") return { present: false, length: 0, masked: "(empty)" };
  const s = String(val);
  if (highlySensitive) return { present: true, length: s.length, masked: `[REDACTED len=${s.length}]` };
  if (s.length <= 8) return { present: true, length: s.length, masked: `${s.slice(0, 2)}…${s.slice(-2)}` };
  return { present: true, length: s.length, masked: `${s.slice(0, 4)}…${s.slice(-4)}` };
}

function auditFile(filePath) {
  const rel = path.relative(repoRoot, filePath);
  const parsed = parseEnvFile(filePath);
  if (parsed.error) {
    console.log(`\n=== ${rel} ===`);
    console.log(`  ERROR: ${parsed.error}`);
    return;
  }
  const stat = fs.statSync(filePath);
  console.log(`\n=== ${rel} ===`);
  console.log(`  size=${stat.size} mtime=${stat.mtime.toISOString()}`);
  for (const key of KEYS) {
    const raw = parsed.vars[key];
    const highlySensitive = key === "SUPABASE_SERVICE_ROLE_KEY";
    const m = mask(raw, highlySensitive);
    const flags = [];
    if (m.present && /^\s|\s$/.test(String(raw))) flags.push("leading/trailing-space");
    if (m.present && String(raw).includes('"') && !String(raw).match(/^".*"$/)) flags.push("embedded-quotes");
    console.log(
      `  ${key}: present=${m.present} len=${m.length} masked=${m.masked}${flags.length ? ` flags=[${flags.join(",")}]` : ""}`,
    );
  }
}

const defaultFiles = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(storefrontRoot, ".env.local"),
  path.join(storefrontRoot, ".env"),
];

const files = process.argv.length > 2 ? process.argv.slice(2) : defaultFiles;
console.log(`Repo root: ${repoRoot}`);
console.log(`Next.js root: ${storefrontRoot}`);
console.log(`CWD: ${process.cwd()}`);

for (const f of files) {
  if (fs.existsSync(f)) auditFile(f);
  else console.log(`\n=== ${path.relative(repoRoot, f)} === MISSING`);
}

// Simulate next.config merge logic
function mergeEnvFiles(...filePaths) {
  const merged = {};
  for (const filePath of filePaths) {
    if (!fs.existsSync(filePath)) continue;
    const { vars } = parseEnvFile(filePath);
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === "string" && value.trim()) merged[key] = value.trim();
    }
  }
  return merged;
}

const merged = mergeEnvFiles(
  path.join(repoRoot, ".env"),
  path.join(storefrontRoot, ".env"),
  path.join(storefrontRoot, ".env.local"),
);

const resolvedUrl = merged.NEXT_PUBLIC_SUPABASE_URL || merged.SUPABASE_URL || "";
const resolvedAnon = merged.NEXT_PUBLIC_SUPABASE_ANON_KEY || merged.SUPABASE_ANON_KEY || "";

console.log("\n=== next.config.mjs merge simulation ===");
console.log(`  resolved NEXT_PUBLIC_SUPABASE_URL: ${mask(resolvedUrl).masked} (len=${resolvedUrl.length})`);
console.log(`  resolved NEXT_PUBLIC_SUPABASE_ANON_KEY: ${mask(resolvedAnon).masked} (len=${resolvedAnon.length})`);
console.log(`  login would be configured: ${Boolean(resolvedUrl && resolvedAnon)}`);

console.log("\n=== common mistakes (non-empty wrong-name keys) ===");
for (const f of defaultFiles) {
  if (!fs.existsSync(f)) continue;
  const { vars } = parseEnvFile(f);
  for (const key of WRONG_NAMES) {
    const v = vars[key];
    if (v?.trim()) {
      console.log(`  ${path.relative(repoRoot, f)} has ${key} (len=${v.length}) — needs NEXT_PUBLIC_* for browser`);
    }
  }
}
