/**
 * Fail before `next dev` when storefront/.env.local is missing required public Supabase keys
 * or contains blank quoted placeholders (common after `vercel env pull`).
 *
 * Usage: node scripts/check-required-env.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_SUPABASE_KEYS,
  envKeyStatus,
  maskEnvValue,
  parseEnvFile,
} from "./env-file-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefrontRoot = path.resolve(__dirname, "..");
const envLocalPath = path.join(storefrontRoot, ".env.local");

function main() {
  const rel = path.relative(path.resolve(storefrontRoot, ".."), envLocalPath);
  const problems = [];

  if (!fs.existsSync(envLocalPath)) {
    console.error(`[env:check] ${rel} is missing.`);
    for (const key of PUBLIC_SUPABASE_KEYS) {
      problems.push({ key, status: "missing", len: 0 });
    }
  } else {
    const { vars, error } = parseEnvFile(envLocalPath);
    if (error && error.code !== "ENOENT") {
      console.error(`[env:check] Failed to read ${rel}: ${error.message}`);
      process.exit(1);
    }
    for (const key of PUBLIC_SUPABASE_KEYS) {
      const status = envKeyStatus(vars[key]);
      if (status !== "ok") {
        problems.push({ key, status, len: typeof vars[key] === "string" ? vars[key].length : 0 });
      }
    }
  }

  if (problems.length === 0) {
    console.log("[env:check] storefront/.env.local public Supabase keys OK");
    for (const key of PUBLIC_SUPABASE_KEYS) {
      const { vars } = parseEnvFile(envLocalPath);
      const v = vars[key] ?? "";
      console.log(`  ${key}: ok len=${v.length} masked=${maskEnvValue(key, v)}`);
    }
    process.exit(0);
  }

  console.error("[env:check] storefront login env is not ready:");
  for (const p of problems) {
    console.error(`  ${p.key}: ${p.status}${p.status === "blank" ? ' (e.g. KEY="")' : ""}`);
  }
  console.error("");
  console.error("Fix:");
  console.error("  cd storefront");
  console.error("  npm run env:sync     # copy from repo root .env when SUPABASE_URL / SUPABASE_ANON_KEY exist");
  console.error("  npm run env:check    # re-verify");
  console.error("");
  console.error("If sync cannot find source values, set keys in storefront/.env.local from");
  console.error("Supabase Dashboard → Settings → API (Project URL + anon public key).");
  console.error("");
  console.error("Note: `vercel env pull` may write blank NEXT_PUBLIC_SUPABASE_* when the");
  console.error("Vercel Development environment lacks those variables. Use --environment=preview");
  console.error("or run env:sync after pull.");
  process.exit(1);
}

main();
