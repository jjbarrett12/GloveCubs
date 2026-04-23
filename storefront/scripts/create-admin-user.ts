/**
 * Supabase Auth-only helper (does NOT grant GloveCubs admin UI/API).
 *
 * For the Express portal, use the repo root script instead:
 *   BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_PASSWORD=... node scripts/bootstrap-admin.js
 * That creates auth.users + public.users (same UUID) + app_admins.
 *
 * Run: npx tsx scripts/create-admin-user.ts
 * Requires .env.local with NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */

import { createClient } from "@supabase/supabase-js";
import * as path from "path";
import * as fs from "fs";

function loadEnv() {
  const dir = path.resolve(__dirname, "..");
  for (const file of [".env.local", ".env"]) {
    const p = path.join(dir, file);
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([^#=]+)=(.*)$/);
        if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
      }
      console.log("Loaded", file);
      return;
    }
  }
}

loadEnv();

const email = "jjbarrett12@gmail.com";
const password = "Jb121212!";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY. Set in .env.local or env."
    );
    process.exit(1);
  }
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { role: "admin" },
  });
  if (error) {
    if (error.message.includes("already been registered")) {
      console.log("User already exists. Updating metadata to admin...");
      const { data: list } = await supabase.auth.admin.listUsers();
      const user = list?.users?.find((u) => u.email === email);
      if (user) {
        const { error: updateErr } = await supabase.auth.admin.updateUserById(user.id, {
          user_metadata: { ...user.user_metadata, role: "admin" },
        });
        if (updateErr) {
          console.error("Update failed:", updateErr.message);
          process.exit(1);
        }
        console.log("Updated existing user to admin.");
        return;
      }
    }
    console.error("Error:", error.message);
    process.exit(1);
  }
  console.log("Admin user created:", data.user?.email);
}

main();
