import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  BASELINE_END,
  EXCLUDED,
  FORBIDDEN_PRODUCTION_REF,
  REQUIRED_STAGING_REF,
  assertTargetRef,
  buildManifest,
  listCanonicalMigrations,
  manifestHash,
  selectBaselineMigrations,
} from "./build-quote-first-baseline-manifest.mjs";

const all = listCanonicalMigrations();
const selected = selectBaselineMigrations(all);
assert.equal(selected[0], "20260302000001_companies_and_members.sql");
assert.equal(selected[selected.length - 1], BASELINE_END);
assert.ok(!selected.includes("20261220120000_gc_commerce_company_invitations.sql"));
assert.ok(EXCLUDED.has("20261220120000_gc_commerce_company_invitations.sql"));

const h = manifestHash(selected);
assert.equal(h, manifestHash(selected));
assert.match(h, /^[a-f0-9]{64}$/);

assert.throws(() => assertTargetRef(FORBIDDEN_PRODUCTION_REF), /refused_production_ref/);
assert.throws(() => assertTargetRef("otherref"), /expected_staging_ref/);
assert.equal(assertTargetRef(REQUIRED_STAGING_REF), REQUIRED_STAGING_REF);

const canonical = path.resolve("supabase/migrations");
const before = fs.readdirSync(canonical).filter((f) => f.endsWith(".sql")).sort();
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "gc-baseline-"));
const result = buildManifest({ targetRef: REQUIRED_STAGING_REF, outDir });
const after = fs.readdirSync(canonical).filter((f) => f.endsWith(".sql")).sort();
assert.deepEqual(after, before);
assert.equal(result.count, result.selected.length);
assert.ok(fs.existsSync(path.join(outDir, "MANIFEST.txt")));
assert.deepEqual(fs.readdirSync(path.join(outDir, "supabase/migrations")).sort(), result.selected);
assert.ok(
  !fs.existsSync(
    path.join(outDir, "supabase/migrations/20261220120000_gc_commerce_company_invitations.sql"),
  ),
);

assert.throws(
  () => selectBaselineMigrations(["20260302000001_companies_and_members.sql"]),
  /last_mismatch/,
);

console.log(JSON.stringify({ ok: true, count: result.count, hash: result.hash }, null, 2));
