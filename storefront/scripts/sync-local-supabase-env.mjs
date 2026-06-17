/**
 * Copy root SUPABASE_URL / SUPABASE_ANON_KEY into storefront/.env.local as NEXT_PUBLIC_*.
 * Preserves non-empty existing values and all unrelated keys/lines.
 * Never copies SUPABASE_SERVICE_ROLE_KEY into any NEXT_PUBLIC_* variable.
 *
 * Usage: node scripts/sync-local-supabase-env.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PUBLIC_SUPABASE_KEYS,
  formatEnvLine,
  maskEnvValue,
  parseEnvFile,
} from "./env-file-utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefrontRoot = path.resolve(__dirname, "..");
const repoRoot = path.resolve(storefrontRoot, "..");
const targetPath = path.join(storefrontRoot, ".env.local");

/** targetKey -> source keys (first non-empty wins) */
const COPY_FROM = {
  NEXT_PUBLIC_SUPABASE_URL: ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL"],
  NEXT_PUBLIC_SUPABASE_ANON_KEY: ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY"],
};

const SOURCE_FILES = [
  path.join(repoRoot, ".env"),
  path.join(repoRoot, ".env.local"),
  path.join(storefrontRoot, ".env"),
];

function loadSources() {
  const merged = {};
  for (const file of SOURCE_FILES) {
    if (!fs.existsSync(file)) continue;
    const { vars } = parseEnvFile(file);
    for (const [key, value] of Object.entries(vars)) {
      if (typeof value === "string" && value.trim()) merged[key] = value.trim();
    }
  }
  return merged;
}

function resolveTargetValue(targetKey, sources, current) {
  if (typeof current === "string" && current.trim()) return current.trim();
  for (const alias of COPY_FROM[targetKey] ?? [targetKey]) {
    const v = sources[alias];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function rewriteEnvLocal(existingText, nextValues) {
  const managed = new Set(PUBLIC_SUPABASE_KEYS);
  const lines = existingText.length ? existingText.split("\n") : [];
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      out.push(line);
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) {
      out.push(line);
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (!managed.has(key)) {
      out.push(line);
      continue;
    }
    seen.add(key);
    const value = nextValues[key];
    if (value) out.push(formatEnvLine(key, value));
    // Drop blank managed lines — empty quoted values break Next.js login.
  }

  for (const key of PUBLIC_SUPABASE_KEYS) {
    if (seen.has(key)) continue;
    const value = nextValues[key];
    if (value) out.push(formatEnvLine(key, value));
  }

  let text = out.join("\n");
  if (text.length && !text.endsWith("\n")) text += "\n";
  return text;
}

function main() {
  const sources = loadSources();
  const existingText = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, "utf8") : "";
  const { vars: currentVars } = parseEnvFile(targetPath);

  const nextValues = {};
  const changes = [];

  for (const key of PUBLIC_SUPABASE_KEYS) {
    const before = currentVars[key] ?? "";
    const after = resolveTargetValue(key, sources, before);
    if (after) nextValues[key] = after;
    if (after && after !== before) {
      changes.push({ key, beforeLen: before.length, afterLen: after.length });
    }
  }

  if (!nextValues.NEXT_PUBLIC_SUPABASE_URL || !nextValues.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error("[env:sync] Could not resolve both public Supabase keys.");
    for (const key of PUBLIC_SUPABASE_KEYS) {
      const v = nextValues[key] ?? "";
      console.error(`  ${key}: present=${Boolean(v)} len=${v.length}`);
    }
    console.error("");
    console.error("Ensure repo root .env has SUPABASE_URL and SUPABASE_ANON_KEY, or set");
    console.error("NEXT_PUBLIC_SUPABASE_* directly in storefront/.env.local.");
    process.exit(1);
  }

  const finalText = rewriteEnvLocal(existingText, nextValues);
  fs.writeFileSync(targetPath, finalText, "utf8");

  console.log(`[env:sync] Wrote ${path.relative(repoRoot, targetPath)}`);
  for (const key of PUBLIC_SUPABASE_KEYS) {
    const v = nextValues[key] ?? "";
    console.log(`  ${key}: present=true len=${v.length} masked=${maskEnvValue(key, v)}`);
  }
  if (changes.length) {
    console.log("Changes:");
    for (const c of changes) {
      console.log(`  ${c.key}: ${c.beforeLen} -> ${c.afterLen} chars`);
    }
  } else {
    console.log("No value changes (already populated).");
  }
}

main();
