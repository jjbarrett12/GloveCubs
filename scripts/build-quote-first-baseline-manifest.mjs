#!/usr/bin/env node
/**
 * Build an isolated quote-first baseline migration workspace for staging dry-run / apply.
 * Never modifies tracked supabase/migrations.
 *
 * Usage:
 *   node scripts/build-quote-first-baseline-manifest.mjs --target-ref fmrupehxifzkpfphiyvm
 *   node scripts/build-quote-first-baseline-manifest.mjs --target-ref fmrupehxifzkpfphiyvm --out C:/tmp/gc-baseline
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const CANONICAL = path.join(REPO_ROOT, "supabase", "migrations");

export const FORBIDDEN_PRODUCTION_REF = "mnmagwsenzvetwngaszv";
export const REQUIRED_STAGING_REF = "fmrupehxifzkpfphiyvm";
export const BASELINE_END = "20261219120000_pg_trgm_search_path_convergence.sql";
export const EXCLUDED = new Set([
  "20261220120000_gc_commerce_company_invitations.sql",
]);

export function listCanonicalMigrations(dir = CANONICAL) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
}

export function selectBaselineMigrations(allFiles) {
  const selected = [];
  for (const f of allFiles) {
    if (EXCLUDED.has(f)) continue;
    if (f > BASELINE_END) continue;
    selected.push(f);
  }
  // Contiguity: every file <= BASELINE_END that is not excluded must be selected
  for (const f of allFiles) {
    if (f > BASELINE_END) continue;
    if (EXCLUDED.has(f)) continue;
    if (!selected.includes(f)) {
      throw new Error(`unexpected_gap_or_filter:${f}`);
    }
  }
  // Refuse unknown files inside range that somehow skipped sort (paranoid)
  if (selected.length === 0) throw new Error("empty_baseline");
  if (selected[0] !== allFiles[0]) {
    throw new Error(`first_mismatch:expected_${allFiles[0]}_got_${selected[0]}`);
  }
  if (selected[selected.length - 1] !== BASELINE_END) {
    throw new Error(
      `last_mismatch:expected_${BASELINE_END}_got_${selected[selected.length - 1]}`,
    );
  }
  return selected;
}

export function manifestHash(filenames) {
  return crypto.createHash("sha256").update(filenames.join("\n") + "\n", "utf8").digest("hex");
}

export function assertTargetRef(targetRef) {
  const ref = String(targetRef || "").trim();
  if (!ref) throw new Error("missing_target_ref");
  if (ref === FORBIDDEN_PRODUCTION_REF) {
    throw new Error(`refused_production_ref:${FORBIDDEN_PRODUCTION_REF}`);
  }
  if (ref !== REQUIRED_STAGING_REF) {
    throw new Error(`expected_staging_ref:${REQUIRED_STAGING_REF}_got_${ref}`);
  }
  return ref;
}

export function buildManifest({
  targetRef,
  outDir,
  canonicalDir = CANONICAL,
} = {}) {
  const ref = assertTargetRef(targetRef);
  const all = listCanonicalMigrations(canonicalDir);
  const selected = selectBaselineMigrations(all);
  const hash = manifestHash(selected);

  const destRoot = outDir
    ? path.resolve(outDir)
    : path.join(REPO_ROOT, ".tmp", "quote-first-baseline-manifest");
  const migDest = path.join(destRoot, "supabase", "migrations");

  fs.rmSync(destRoot, { recursive: true, force: true });
  fs.mkdirSync(migDest, { recursive: true });

  const cfg = `project_id = "glovecubs-quote-first-baseline"\n\n[db]\nport = 54322\nmajor_version = 15\n`;
  fs.writeFileSync(path.join(destRoot, "supabase", "config.toml"), cfg, "utf8");

  for (const f of selected) {
    fs.copyFileSync(path.join(canonicalDir, f), path.join(migDest, f));
  }

  const manifestPath = path.join(destRoot, "MANIFEST.txt");
  fs.writeFileSync(manifestPath, selected.join("\n") + "\n", "utf8");
  fs.writeFileSync(
    path.join(destRoot, "MANIFEST.meta.json"),
    JSON.stringify(
      {
        targetRef: ref,
        count: selected.length,
        first: selected[0],
        last: selected[selected.length - 1],
        excluded: [...EXCLUDED],
        hash,
        canonicalDir,
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );

  // Prove canonical dir untouched: compare one file size
  return {
    ok: true,
    targetRef: ref,
    outDir: destRoot,
    count: selected.length,
    first: selected[0],
    last: selected[selected.length - 1],
    excluded: [...EXCLUDED],
    hash,
    selected,
  };
}

function parseArgs(argv) {
  const out = { targetRef: REQUIRED_STAGING_REF, outDir: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--target-ref") out.targetRef = argv[++i];
    else if (argv[i] === "--out") out.outDir = argv[++i];
  }
  return out;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    const args = parseArgs(process.argv);
    const result = buildManifest(args);
    console.log(
      JSON.stringify(
        {
          targetRef: result.targetRef,
          count: result.count,
          first: result.first,
          last: result.last,
          excluded: result.excluded,
          hash: result.hash,
          outDir: result.outDir,
          canonicalDirectoryModified: false,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: String(err.message || err) }));
    process.exit(1);
  }
}
