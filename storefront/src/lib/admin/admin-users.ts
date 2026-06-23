import type { SupabaseClient } from "@supabase/supabase-js";

/** Public buyer profile row shape for admin list/update (no password fields). */
export type AdminUserRow = {
  id: string;
  email: string;
  company_name?: string;
  contact_name?: string;
  is_approved?: number | boolean;
  discount_tier?: string;
  pricing_tier_source?: string;
  payment_terms?: string;
  phone?: string;
  created_at?: string;
  updated_at?: string;
};

export type AdminUserUpdateInput = {
  is_approved?: boolean;
  discount_tier?: string;
  payment_terms?: string;
};

const AUTH_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const USER_PUBLIC_SELECT =
  "id, email, company_name, contact_name, is_approved, discount_tier, pricing_tier_source, payment_terms, phone, created_at, updated_at";

export function isAuthUserUuid(id: string): boolean {
  return AUTH_UUID_RE.test(String(id || "").trim());
}

function normalizePaymentTerms(pt: string): "credit_card" | "ach" | "net30" {
  if (pt === "net30") return "net30";
  if (pt === "ach") return "ach";
  return "credit_card";
}

async function insertPricingTierAuditLog(
  supabase: SupabaseClient,
  params: {
    userId: string;
    oldTier: string | null | undefined;
    newTier: string;
    reason: string;
    source: string;
  },
): Promise<void> {
  const { error } = await supabase.from("pricing_tier_audit_log").insert({
    user_id: params.userId,
    old_tier_code: params.oldTier != null ? String(params.oldTier) : null,
    new_tier_code: String(params.newTier),
    reason: params.reason,
    source: params.source,
    metrics_snapshot: null,
  });
  if (error) console.error("[admin-users] pricing tier audit", error);
}

function toAdminUserRow(row: Record<string, unknown>, emailOverride?: string): AdminUserRow {
  const email =
    (emailOverride ?? (row.email != null ? String(row.email) : "")).trim().toLowerCase() ||
    (row.email != null ? String(row.email) : "");
  return {
    id: String(row.id),
    email,
    company_name: row.company_name != null ? String(row.company_name) : undefined,
    contact_name: row.contact_name != null ? String(row.contact_name) : undefined,
    is_approved: row.is_approved as number | boolean | undefined,
    discount_tier: row.discount_tier != null ? String(row.discount_tier) : undefined,
    pricing_tier_source: row.pricing_tier_source != null ? String(row.pricing_tier_source) : undefined,
    payment_terms: row.payment_terms != null ? String(row.payment_terms) : undefined,
    phone: row.phone != null ? String(row.phone) : undefined,
    created_at: row.created_at != null ? String(row.created_at) : undefined,
    updated_at: row.updated_at != null ? String(row.updated_at) : undefined,
  };
}

/** List buyer users for admin (mirrors Express GET /api/admin/users safe payload). */
export async function fetchAdminUsers(
  supabase: SupabaseClient,
): Promise<{ rows: AdminUserRow[]; error: string | null; status: number }> {
  const { data, error } = await supabase
    .from("users")
    .select(USER_PUBLIC_SELECT)
    .order("created_at", { ascending: false });

  if (error) {
    return { rows: [], error: error.message, status: 500 };
  }

  const rows: AdminUserRow[] = [];
  for (const raw of data ?? []) {
    const row = raw as Record<string, unknown>;
    let email = row.email != null ? String(row.email).trim().toLowerCase() : "";
    if (!email) {
      const { data: authWrap } = await supabase.auth.admin.getUserById(String(row.id));
      email = (authWrap?.user?.email ?? "").trim().toLowerCase();
    }
    rows.push(toAdminUserRow(row, email));
  }

  return { rows, error: null, status: 200 };
}

/** Update buyer approval, tier, or payment terms (mirrors Express PUT /api/admin/users/:id). */
export async function updateAdminUser(
  supabase: SupabaseClient,
  userId: string,
  payload: AdminUserUpdateInput,
): Promise<{ user: AdminUserRow | null; error: string | null; status: number }> {
  if (!isAuthUserUuid(userId)) {
    return { user: null, error: "Invalid user id", status: 400 };
  }

  const { data: existing, error: fetchErr } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (fetchErr) {
    return { user: null, error: fetchErr.message, status: 500 };
  }
  if (!existing) {
    return { user: null, error: "User not found", status: 404 };
  }

  const oldTier = (existing as { discount_tier?: string }).discount_tier;
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (payload.is_approved !== undefined) {
    updates.is_approved = payload.is_approved ? 1 : 0;
  }
  if (payload.discount_tier !== undefined) {
    updates.discount_tier = payload.discount_tier;
    updates.pricing_tier_source = "manual";
  }
  if (payload.payment_terms !== undefined) {
    updates.payment_terms = normalizePaymentTerms(payload.payment_terms);
  }

  const { error: updateErr } = await supabase.from("users").update(updates).eq("id", userId);
  if (updateErr) {
    return { user: null, error: updateErr.message, status: 500 };
  }

  if (
    payload.discount_tier &&
    String(payload.discount_tier).toLowerCase() !== String(oldTier || "").toLowerCase()
  ) {
    try {
      await insertPricingTierAuditLog(supabase, {
        userId,
        oldTier,
        newTier: payload.discount_tier,
        reason: "Admin updated tier",
        source: "admin_override",
      });
    } catch (auditErr) {
      console.error("[admin-users] tier audit", auditErr);
    }
  }

  const { data: updated, error: reloadErr } = await supabase
    .from("users")
    .select(USER_PUBLIC_SELECT)
    .eq("id", userId)
    .maybeSingle();

  if (reloadErr) {
    return { user: null, error: reloadErr.message, status: 500 };
  }
  if (!updated) {
    return { user: null, error: "User not found", status: 404 };
  }

  return { user: toAdminUserRow(updated as Record<string, unknown>), error: null, status: 200 };
}
