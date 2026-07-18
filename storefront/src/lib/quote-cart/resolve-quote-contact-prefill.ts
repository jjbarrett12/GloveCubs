/**
 * Server-only: resolve quote cart contact prefill for the signed-in buyer's active company.
 */

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  assertCustomerCompanyAccess,
  resolveCustomerProcurementGate,
} from "@/lib/procurement/customer-procurement-session";
import { buildQuoteContactPrefill, type QuoteContactPrefill } from "@/lib/quote-cart/quote-contact-prefill";

export async function resolveQuoteContactPrefill(supabaseAdmin: unknown): Promise<QuoteContactPrefill | null> {
  const gate = await resolveCustomerProcurementGate(supabaseAdmin);
  if (gate.kind !== "ready") return null;

  const { userId, companyId } = gate.session;
  const allowed = await assertCustomerCompanyAccess(supabaseAdmin as any, userId, companyId);
  if (!allowed) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url?.trim() || !anon?.trim()) return null;

  const cookieStore = await cookies();
  const authClient = createServerClient(url.trim(), anon.trim(), {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
    },
  });
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user?.id || String(user.id) !== userId) return null;

  const { data: company, error: coErr } = await (supabaseAdmin as any)
    .schema("gc_commerce")
    .from("companies")
    .select("trade_name")
    .eq("id", companyId)
    .maybeSingle();
  if (coErr) return null;

  return buildQuoteContactPrefill({
    email: user.email,
    userMetadata: user.user_metadata as Record<string, unknown> | undefined,
    companyTradeName: company?.trade_name ?? null,
  });
}
