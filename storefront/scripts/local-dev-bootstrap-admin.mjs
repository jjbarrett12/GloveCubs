/**
 * LOCAL / DEVELOPMENT: create or reset a Supabase Auth user and grant operator access.
 *
 * Canonical allowlist: public.admin_users (id = auth.users.id).
 * Also upserts public.app_admins compat mirror (transitional — see lib/admin-identity.js).
 *
 * Rules:
 * - Password ONLY from env GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD (never hardcode; do not pass on argv).
 * - Remote Supabase (*.supabase.co, etc.) requires GC_ALLOW_REMOTE_SUPABASE_AUTH_BOOTSTRAP=1.
 * - Does not print service role keys, JWTs, or passwords.
 *
 * Usage (from storefront/):
 *   GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD='…' GC_ALLOW_REMOTE_SUPABASE_AUTH_BOOTSTRAP=1 node scripts/local-dev-bootstrap-admin.mjs [email]
 *
 * npm: npm run bootstrap-local-admin -- hello@glovecubs.com
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createClient } from "@supabase/supabase-js";

const require = createRequire(import.meta.url);
const { grantCanonicalAdminOperator } = require("../../lib/admin-identity.js");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");

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

function safeHost(urlStr) {
  try {
    return new URL(urlStr.trim()).hostname;
  } catch {
    return "(invalid URL)";
  }
}

function projectRefFromSupabaseHost(hostname) {
  const m = String(hostname).toLowerCase().match(/^([a-z0-9-]+)\.supabase\.co$/);
  return m ? m[1] : null;
}

function jwtPayloadRef(jwt) {
  const parts = String(jwt || "").split(".");
  if (parts.length < 2) return null;
  const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  try {
    const json = Buffer.from(b64 + pad, "base64").toString("utf8");
    const payload = JSON.parse(json);
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

function isLocalSupabaseApiHost(hostname) {
  const h = String(hostname).toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
}

async function findAuthUserByEmail(sb, emailLower) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const users = data.users || [];
    const found = users.find((u) => (u.email || "").toLowerCase() === emailLower);
    if (found) return found;
    if (users.length < 1000) break;
  }
  return null;
}

const fileEnv = loadEnv(envPath);
for (const [k, v] of Object.entries(fileEnv)) {
  if (process.env[k] === undefined) process.env[k] = v;
}

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim();
const serviceRole = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

const email = (process.argv[2] || "hello@glovecubs.com").trim().toLowerCase();
const password = (process.env.GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD || "").trim();

const host = safeHost(supabaseUrl);
const urlRef = projectRefFromSupabaseHost(host);

console.log("[bootstrap] Active Supabase API host:", host);
if (urlRef) console.log("[bootstrap] Project ref from URL:", urlRef);

if (process.env.VERCEL_ENV === "production") {
  console.error("[bootstrap] Abort: VERCEL_ENV=production.");
  process.exit(1);
}

if (!isLocalSupabaseApiHost(host)) {
  if (process.env.GC_ALLOW_REMOTE_SUPABASE_AUTH_BOOTSTRAP !== "1") {
    console.error(
      "[bootstrap] Abort: remote Supabase host. Set GC_ALLOW_REMOTE_SUPABASE_AUTH_BOOTSTRAP=1 for this run to confirm intentional remote/dev project.",
    );
    process.exit(1);
  }
  console.log("[bootstrap] Remote Supabase bootstrap allowed (GC_ALLOW_REMOTE_SUPABASE_AUTH_BOOTSTRAP=1).");
}

if (!supabaseUrl || !serviceRole) {
  console.error("[bootstrap] Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

if (!password || password.length < 8) {
  console.error("[bootstrap] Set GC_LOCAL_AUTH_BOOTSTRAP_PASSWORD (min 8 characters). Not accepted via argv.");
  process.exit(1);
}

const anonRef = jwtPayloadRef(anonKey);
if (anonKey && urlRef && anonRef && anonRef !== urlRef) {
  console.warn(
    "[bootstrap] WARN: anon JWT `ref` does not match URL project ref. Fix NEXT_PUBLIC_SUPABASE_ANON_KEY or browser sign-in will fail with Invalid API key.",
  );
}

const sb = createClient(supabaseUrl, serviceRole, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let authUser = await findAuthUserByEmail(sb, email);
let created = false;

if (!authUser) {
  const { data, error } = await sb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("[bootstrap] createUser failed:", error.message);
    process.exit(2);
  }
  authUser = data.user;
  created = true;
} else {
  const { error } = await sb.auth.admin.updateUserById(authUser.id, {
    password,
    email_confirm: true,
  });
  if (error) {
    console.error("[bootstrap] updateUserById failed:", error.message);
    process.exit(3);
  }
}

const { error: admErr } = await (async () => {
  try {
    await grantCanonicalAdminOperator(sb, { id: authUser.id, email: authUser.email || email });
    return { error: null };
  } catch (e) {
    return { error: { message: e.message || String(e) } };
  }
})();
if (admErr) {
  console.error("[bootstrap] admin grant:", admErr.message);
  process.exit(4);
}

console.log("[bootstrap] Auth user:", created ? "created" : "password reset + email_confirm");
console.log("[bootstrap] admin_users + app_admins compat: active row for auth id", authUser.id);

if (anonKey && urlRef && anonRef === urlRef) {
  const anonClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await anonClient.auth.signInWithPassword({ email, password });
  if (signErr) {
    console.warn("[bootstrap] Anon sign-in check failed:", signErr.message);
  } else {
    console.log("[bootstrap] Anon sign-in check: OK (session established with anon client).");
    await anonClient.auth.signOut();
  }
} else {
  console.log("[bootstrap] Skipped anon sign-in check (fix anon key ref vs URL to enable).");
}

console.log("[bootstrap] Done. Restart `npm run dev` if you changed .env.local.");
