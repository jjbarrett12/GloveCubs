/**
 * Copy monorepo lib packages into storefront/lib for Vercel builds (storefront-only root).
 * No-op when sources are missing (local lib/ already mirrored).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storefrontRoot = path.join(__dirname, "..");
const repoLib = path.join(storefrontRoot, "..", "lib");
const vendorLib = path.join(storefrontRoot, "lib");

const PACKAGES = ["commerce-packaging", "glove-sku-intelligence", "unified-ingestion"];
const FILES = [
  "contamination-heuristics.js",
  "inventory.js",
  "supplier-offer-normalization.ts",
  "resolve-canonical-product-id.js",
  "resolve-catalog-v2-product-id.js",
  "catalog-v2-product-guard.js",
  "commerce-truth-warnings.js",
  "variant-inventory-authority.js",
  "legacy-warehouse-deprecation.js",
];

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

for (const pkg of PACKAGES) {
  const src = path.join(repoLib, pkg);
  const dest = path.join(vendorLib, pkg);
  if (fs.existsSync(src)) {
    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(src, dest);
  }
  if (!fs.existsSync(dest)) {
    console.error(`[sync-vendor-lib] missing ${pkg} — run from monorepo root or commit storefront/lib/${pkg}`);
    process.exit(1);
  }
}

for (const file of FILES) {
  const src = path.join(repoLib, file);
  const dest = path.join(vendorLib, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, dest);
  if (!fs.existsSync(dest)) {
    console.error(`[sync-vendor-lib] missing ${file} — run from monorepo root or commit storefront/lib/${file}`);
    process.exit(1);
  }
}
