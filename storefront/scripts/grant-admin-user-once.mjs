/**
 * Grant storefront /admin access for an auth user by email (public.admin_users.id = auth.users.id).
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL in .env.local.
 * Usage: node scripts/grant-admin-user-once.mjs you@example.com
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

function loadEnv(p) {
  const o = {};
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    o[t.slice(0, i)] = t.slice(i + 1);
  }
  return o;
}

const emailArg = (process.argv[2] || "").trim().toLowerCase();
if (!emailArg) {
  console.error("Usage: node scripts/grant-admin-user-once.mjs <email>");
  process.exit(1);
}

const env = loadEnv(envPath);
const url = (env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const sr = (env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
if (!url || !sr) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, sr, { auth: { persistSession: false, autoRefreshToken: false } });

let found = null;
for (let page = 1; page <= 50 && !found; page++) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) {
    console.error("listUsers:", error.message);
    process.exit(2);
  }
  const users = data.users || [];
  found = users.find((u) => (u.email || "").toLowerCase() === emailArg);
  if (users.length < 1000) break;
}

if (!found) {
  console.error(`No auth.users row for ${emailArg}. Create the user in Supabase Auth first, then re-run.`);
  process.exit(3);
}

const { error: upsertErr } = await sb.from("admin_users").upsert(
  { id: found.id, is_active: true },
  { onConflict: "id" },
);

if (upsertErr) {
  console.error("admin_users upsert:", upsertErr.message, upsertErr);
  process.exit(4);
}

console.log("OK: admin_users row for", found.email, "id", found.id);
