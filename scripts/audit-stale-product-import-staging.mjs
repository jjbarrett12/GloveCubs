/**
 * Read-only report: clipboard URL staging rows with legacy parser versions.
 *
 * Usage (from repo root):
 *   node scripts/audit-stale-product-import-staging.mjs
 *   node scripts/audit-stale-product-import-staging.mjs --url "hospeco"
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", "storefront", ".env.local");

function loadEnv(p) {
  const o = {};
  if (!fs.existsSync(p)) {
    console.error("Missing env file:", p);
    process.exit(1);
  }
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    o[t.slice(0, i)] = t.slice(i + 1);
  }
  return o;
}

const urlFilter = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]?.trim().toLowerCase()
  : null;

const env = loadEnv(envPath);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data, error } = await sb
  .schema("catalog_v2")
  .from("admin_url_clipboard_staging")
  .select("id, product_page_url, review_status, created_catalog_product_id, extracted, created_at")
  .order("created_at", { ascending: false })
  .limit(200);

if (error) {
  console.error("Query failed:", error.message);
  process.exit(1);
}

const rows = (data ?? []).filter((r) => {
  if (!urlFilter) return true;
  return String(r.product_page_url ?? "").toLowerCase().includes(urlFilter);
});

console.log("URL\tstaging_id\tparser_version\tstatus\tproduct_id\trecommended_action");

for (const row of rows) {
  const ex = row.extracted ?? {};
  const draft = ex.import_draft_v1 ?? ex.draft ?? null;
  const parser = draft?.parser_version ?? ex.import_parser_version ?? "unknown";
  const isLegacy = String(parser).includes("v1") || parser === "productExtraction.v1";
  if (!isLegacy && urlFilter == null) continue;

  const action =
    row.review_status === "needs_review"
      ? "dismiss and re-stage after parser upgrade"
      : "do not use for Phase 3C QA; re-stage fresh URL";

  console.log(
    [
      row.product_page_url,
      row.id,
      parser,
      row.review_status,
      row.created_catalog_product_id ?? "",
      isLegacy ? action : "ok",
    ].join("\t")
  );
}
