/**
 * Policy/ordering tests for product_favorites clean-room replay.
 * Complements ephemeral Postgres proof; does not replace it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mig = (name) => fs.readFileSync(path.join(root, "supabase/migrations", name), "utf8");

const early = mig("20260422120000_product_favorites_catalog_uuid.sql");
const late = mig("20260630150100_product_favorites_after_users.sql");
const assertSql = mig("20261219130000_product_favorites_canonical_assert.sql");

assert.match(early, /to_regclass\('public\.product_favorites'\)/);
assert.match(early, /CREATE TABLE public\.product_favorites/);
assert.match(early, /REFERENCES catalogos\.products/);
assert.doesNotMatch(early, /^TRUNCATE TABLE public\.product_favorites;/m);

assert.match(late, /product_id UUID NOT NULL REFERENCES catalogos\.products/);
assert.doesNotMatch(late, /product_id BIGINT NOT NULL REFERENCES public\.products/);

assert.match(assertSql, /catalog_v2\.catalog_products/);
assert.match(assertSql, /user_id must be uuid/);
assert.match(assertSql, /product_id must be uuid/);

console.log(JSON.stringify({ ok: true, tests: 6 }, null, 2));
