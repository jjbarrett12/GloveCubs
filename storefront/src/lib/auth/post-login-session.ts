import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";
/**
 * Resolve the signed-in user for post-login routing.
 * Prefer `Authorization: Bearer <access_token>` from the client immediately after
 * `signInWithPassword` so the route does not depend on cookies being visible on the
 * first same-origin fetch (avoids `/account` + stale `next` → `/request-pricing`).
 */
export async function resolveUserForPostLoginDestination(params: {
  supabaseUrl: string;
  anonKey: string;
  serviceRoleKey: string;
  authorizationHeader: string | null;
  cookieGet: (name: string) => string | undefined;
}): Promise<{ user: User; via: "bearer" | "cookie" } | { user: null; via: "none" }> {
  const bearer = params.authorizationHeader?.replace(/^Bearer\s+/i, "").trim();
  if (bearer) {
    const scoped = createClient(params.supabaseUrl, params.anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await scoped.auth.getUser();
    if (!error && data.user) return { user: data.user, via: "bearer" };
  }

  const svc = createServerClient(params.supabaseUrl, params.serviceRoleKey, {
    cookies: { get: params.cookieGet },
  });
  const { data, error } = await svc.auth.getUser();
  if (!error && data.user) return { user: data.user, via: "cookie" };
  return { user: null, via: "none" };
}

/** Same cookie contract as `resolveUserForPostLoginDestination` cookie path, for `/admin` layout. */
export async function resolveUserFromAdminCookies(
  supabaseUrl: string,
  serviceRoleKey: string,
  cookieStore: { get(name: string): { value?: string } | undefined },
): Promise<User | null> {
  const supabase = createServerClient(supabaseUrl, serviceRoleKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}
