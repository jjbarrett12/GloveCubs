"use client";

import { createBrowserClient } from "@supabase/ssr";
import { resolveSupabasePublicEnv } from "@/lib/supabase/public-env";

export function createSupabaseBrowserClient() {
  const { url, anon } = resolveSupabasePublicEnv();
  if (!url || !anon) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required for sign-in.");
  }
  return createBrowserClient(url, anon);
}
