#!/usr/bin/env node
/**
 * Regenerate Supabase TypeScript types from the database schema.
 *
 * Requires ONE of:
 *   - DATABASE_URL or SUPABASE_DB_URL (Postgres connection string, pooler or direct)
 *   - SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN (Supabase Management API)
 *
 * Output:
 *   - storefront/src/lib/supabase/database.from-remote.ts
 *
 * Usage (repo root):
 *   node scripts/gen-supabase-types.mjs
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import "dotenv/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
/** Full schema from DB; wire into types.ts after review (see docs/types-and-contract-audit.md). */
const outFile = path.join(root, "storefront", "src", "lib", "supabase", "database.from-remote.ts");

const dbUrl = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
const projectRef =
  process.env.SUPABASE_PROJECT_REF ||
  (process.env.SUPABASE_URL && extractProjectRef(process.env.SUPABASE_URL));

function extractProjectRef(url) {
  try {
    const host = new URL(url).hostname;
    const sub = host.split(".")[0];
    if (host.endsWith(".supabase.co") && sub) return sub;
  } catch {
    /* ignore */
  }
  return null;
}

function runSupabaseGenTypes(args) {
  const r = spawnSync("npx", ["--yes", "supabase", "gen", "types", ...args], {
    cwd: root,
    encoding: "utf-8",
    shell: true,
    maxBuffer: 50 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(r.stderr || r.stdout);
    process.exit(r.status ?? 1);
  }
  return r.stdout;
}

let output = "";

const SCHEMA_FLAGS = ["--schema", "public", "--schema", "catalogos"];

if (dbUrl) {
  console.log("Generating types from --db-url …");
  output = runSupabaseGenTypes(["--db-url", dbUrl, ...SCHEMA_FLAGS]);
} else if (projectRef && process.env.SUPABASE_ACCESS_TOKEN) {
  console.log(`Generating types from project ${projectRef} …`);
  output = runSupabaseGenTypes(["--project-id", projectRef, ...SCHEMA_FLAGS]);
} else {
  console.error(
    [
      "Cannot regenerate Supabase types: no DATABASE_URL / SUPABASE_DB_URL and no SUPABASE_PROJECT_REF + SUPABASE_ACCESS_TOKEN.",
      "Set DATABASE_URL (e.g. from Supabase Dashboard → Settings → Database) and re-run:",
      "  node scripts/gen-supabase-types.mjs",
      "",
      "Until then, the repo uses a permissive Database definition plus strict commerce row types in database.manual.ts.",
    ].join("\n")
  );
  process.exit(1);
}

const banner = `/**
 * AUTO-GENERATED FILE — do not edit by hand.
 * Generated: ${new Date().toISOString()}
 * Command: npx supabase gen types --db-url … --schema public --schema catalogos
 *
 * Regenerate from repo root:
 *   npm run gen:db-types
 */
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, banner + output, "utf-8");
console.log("Wrote", path.relative(root, outFile));
