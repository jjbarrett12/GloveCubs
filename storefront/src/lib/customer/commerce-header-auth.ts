import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { resolveCustomerProcurementGate } from "@/lib/procurement/customer-procurement-session";

export type CommerceHeaderAuth =
  | { kind: "anonymous" }
  | { kind: "signed_in"; email: string | null; showWorkspace: boolean };

/**
 * Server-only auth snapshot for the public commerce header (no redirects).
 */
export async function resolveCommerceHeaderAuth(): Promise<CommerceHeaderAuth> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !anon || !isSupabaseConfigured()) {
    return { kind: "anonymous" };
  }

  const cookieStore = await cookies();
  const authClient = createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });

  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.id) {
    return { kind: "anonymous" };
  }

  const gate = await resolveCustomerProcurementGate(getSupabaseAdmin() as any);
  const showWorkspace = gate.kind === "ready" || gate.kind === "active_company_required";

  return {
    kind: "signed_in",
    email: typeof user.email === "string" ? user.email : null,
    showWorkspace,
  };
}
