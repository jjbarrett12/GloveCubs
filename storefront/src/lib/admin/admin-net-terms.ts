import type { SupabaseClient } from "@supabase/supabase-js";

const GC = "gc_commerce";

const GC_COMPANY_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TERMS_CODES = new Set(["net15", "net30", "custom"]);

export type AdminNetTermsApplication = {
  id: string;
  company_id: string;
  company_name: string | null;
  company_net_terms_status?: string | null;
  applicant_email: string | null;
  applicant_user_id?: string;
  status: string;
  business_name?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  billing_address_line1?: string | null;
  billing_city?: string | null;
  billing_state?: string | null;
  billing_zip?: string | null;
  ein_tax_id?: string | null;
  years_in_business?: string | null;
  requested_credit_limit?: number | null;
  monthly_estimated_spend?: number | null;
  trade_references?: unknown;
  tax_exempt?: boolean;
  tax_certificate_note?: string | null;
  reviewed_by_user_id?: string | null;
  reviewed_at?: string | null;
  decision_notes?: string | null;
  approved_credit_limit?: number | null;
  approved_invoice_terms_code?: string | null;
  approved_invoice_orders_allowed?: boolean | null;
  created_at: string;
  updated_at?: string;
};

export type AdminNetTermsDecisionInput = {
  action: "approve" | "deny" | "hold" | "resume";
  decision_notes?: string;
  invoice_terms_code?: "net15" | "net30" | "custom";
  invoice_terms_custom?: string;
  approved_credit_limit?: number | string;
  invoice_orders_allowed?: boolean;
  internal_notes?: string;
};

export function isGcCompanyUuid(v: string): boolean {
  return GC_COMPANY_UUID_RE.test(String(v || "").trim());
}

export function numOrNull(v: unknown): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function mapApplicationRow(r: Record<string, unknown> | null): AdminNetTermsApplication | null {
  if (!r) return null;
  return {
    id: String(r.id),
    company_id: String(r.company_id),
    company_name: null,
    applicant_email: null,
    applicant_user_id: r.applicant_user_id != null ? String(r.applicant_user_id) : undefined,
    status: String(r.status),
    business_name: r.business_name != null ? String(r.business_name) : null,
    contact_name: r.contact_name != null ? String(r.contact_name) : null,
    email: r.email != null ? String(r.email) : null,
    phone: r.phone != null ? String(r.phone) : null,
    billing_address_line1: r.billing_address_line1 != null ? String(r.billing_address_line1) : null,
    billing_city: r.billing_city != null ? String(r.billing_city) : null,
    billing_state: r.billing_state != null ? String(r.billing_state) : null,
    billing_zip: r.billing_zip != null ? String(r.billing_zip) : null,
    ein_tax_id: r.ein_tax_id != null ? String(r.ein_tax_id) : null,
    years_in_business: r.years_in_business != null ? String(r.years_in_business) : null,
    requested_credit_limit: r.requested_credit_limit != null ? Number(r.requested_credit_limit) : null,
    monthly_estimated_spend: r.monthly_estimated_spend != null ? Number(r.monthly_estimated_spend) : null,
    trade_references: r.trade_references,
    tax_exempt: !!r.tax_exempt,
    tax_certificate_note: r.tax_certificate_note != null ? String(r.tax_certificate_note) : null,
    reviewed_by_user_id: r.reviewed_by_user_id != null ? String(r.reviewed_by_user_id) : null,
    reviewed_at: r.reviewed_at != null ? String(r.reviewed_at) : null,
    decision_notes: r.decision_notes != null ? String(r.decision_notes) : null,
    approved_credit_limit: r.approved_credit_limit != null ? Number(r.approved_credit_limit) : null,
    approved_invoice_terms_code:
      r.approved_invoice_terms_code != null ? String(r.approved_invoice_terms_code) : null,
    approved_invoice_orders_allowed:
      r.approved_invoice_orders_allowed != null ? !!r.approved_invoice_orders_allowed : null,
    created_at: String(r.created_at),
    updated_at: r.updated_at != null ? String(r.updated_at) : undefined,
  };
}

function gcSchema(supabase: SupabaseClient) {
  return supabase.schema(GC);
}

/** List net terms applications for admin (mirrors Express GET /api/admin/net-terms/applications). */
export async function fetchAdminNetTermsApplications(
  supabase: SupabaseClient,
  status?: string,
): Promise<{ applications: AdminNetTermsApplication[]; error: string | null; status: number }> {
  let q = gcSchema(supabase)
    .from("net_terms_applications")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  if (status?.trim()) {
    q = q.eq("status", status.trim());
  }

  const { data, error } = await q;
  if (error) {
    return { applications: [], error: error.message, status: 500 };
  }

  const rows = (data ?? []) as Record<string, unknown>[];
  const companyIds = [...new Set(rows.map((r) => r.company_id).filter(Boolean))] as string[];
  const applicantIds = [...new Set(rows.map((r) => r.applicant_user_id).filter(Boolean))] as string[];

  const companiesById = new Map<string, { name: string; net_terms_status: string | null }>();
  if (companyIds.length > 0) {
    const { data: companies, error: coErr } = await gcSchema(supabase)
      .from("companies")
      .select("id, trade_name, slug, net_terms_status")
      .in("id", companyIds);
    if (coErr) {
      return { applications: [], error: coErr.message, status: 500 };
    }
    for (const c of companies ?? []) {
      const row = c as { id: string; trade_name?: string; slug?: string; net_terms_status?: string | null };
      companiesById.set(String(row.id), {
        name: row.trade_name || row.slug || "Company",
        net_terms_status: row.net_terms_status ?? null,
      });
    }
  }

  const emailByUserId = new Map<string, string>();
  if (applicantIds.length > 0) {
    const { data: users, error: uErr } = await supabase.from("users").select("id, email").in("id", applicantIds);
    if (uErr) {
      return { applications: [], error: uErr.message, status: 500 };
    }
    for (const u of users ?? []) {
      const row = u as { id: string; email?: string | null };
      if (row.email) emailByUserId.set(String(row.id), String(row.email));
    }
  }

  const applications: AdminNetTermsApplication[] = rows.map((r) => {
    const mapped = mapApplicationRow(r)!;
    const co = companiesById.get(mapped.company_id);
    return {
      ...mapped,
      company_name: co?.name ?? null,
      company_net_terms_status: co?.net_terms_status ?? null,
      applicant_email: mapped.applicant_user_id ? emailByUserId.get(mapped.applicant_user_id) ?? null : null,
    };
  });

  return { applications, error: null, status: 200 };
}

/** Apply admin decision (mirrors Express PATCH /api/admin/net-terms/applications/:id). */
export async function applyAdminNetTermsDecision(
  supabase: SupabaseClient,
  adminUserId: string,
  applicationId: string,
  payload: AdminNetTermsDecisionInput,
): Promise<{ application: AdminNetTermsApplication | null; error: string | null; status: number }> {
  const action = payload.action.toLowerCase();
  const appId = String(applicationId || "").trim();

  if (!isGcCompanyUuid(appId)) {
    return { application: null, error: "Invalid application id", status: 400 };
  }

  const { data: appRow, error: fetchErr } = await gcSchema(supabase)
    .from("net_terms_applications")
    .select("*")
    .eq("id", appId)
    .maybeSingle();

  if (fetchErr) {
    return { application: null, error: fetchErr.message, status: 500 };
  }
  if (!appRow) {
    return { application: null, error: "Application not found", status: 404 };
  }

  const row = appRow as Record<string, unknown>;
  const now = new Date().toISOString();
  const notes = payload.decision_notes != null ? String(payload.decision_notes).trim() : null;

  if (action === "hold") {
    if (row.status !== "pending") {
      return { application: null, error: "Can only place pending applications on hold", status: 400 };
    }
    const { data, error } = await gcSchema(supabase)
      .from("net_terms_applications")
      .update({
        status: "on_hold",
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", appId)
      .select("*")
      .single();
    if (error) return { application: null, error: error.message, status: 500 };
    return { application: mapApplicationRow(data as Record<string, unknown>), error: null, status: 200 };
  }

  if (action === "deny") {
    if (!["pending", "on_hold"].includes(String(row.status))) {
      return { application: null, error: "Can only deny pending or on-hold applications", status: 400 };
    }
    const { data, error } = await gcSchema(supabase)
      .from("net_terms_applications")
      .update({
        status: "denied",
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        updated_at: now,
      })
      .eq("id", appId)
      .select("*")
      .single();
    if (error) return { application: null, error: error.message, status: 500 };

    const { error: coErr } = await gcSchema(supabase)
      .from("companies")
      .update({
        net_terms_status: "denied",
        invoice_orders_allowed: false,
        net_terms_reviewed_at: now,
        net_terms_reviewed_by_user_id: adminUserId,
        updated_at: now,
      })
      .eq("id", row.company_id);

    if (coErr) return { application: null, error: coErr.message, status: 500 };
    return { application: mapApplicationRow(data as Record<string, unknown>), error: null, status: 200 };
  }

  if (action === "approve") {
    if (!["pending", "on_hold"].includes(String(row.status))) {
      return { application: null, error: "Can only approve pending or on-hold applications", status: 400 };
    }
    const code = (payload.invoice_terms_code || "net30").toLowerCase();
    if (!TERMS_CODES.has(code)) {
      return { application: null, error: "invoice_terms_code must be net15, net30, or custom", status: 400 };
    }
    const custom = payload.invoice_terms_custom ?? null;
    if (code === "custom" && !(custom && String(custom).trim())) {
      return {
        application: null,
        error: "invoice_terms_custom is required when invoice_terms_code is custom",
        status: 400,
      };
    }
    const approvedLimit = numOrNull(payload.approved_credit_limit);
    const invoiceAllowed =
      payload.invoice_orders_allowed !== undefined ? !!payload.invoice_orders_allowed : true;

    const { data, error } = await gcSchema(supabase)
      .from("net_terms_applications")
      .update({
        status: "approved",
        decision_notes: notes,
        reviewed_by_user_id: adminUserId,
        reviewed_at: now,
        approved_credit_limit: approvedLimit,
        approved_invoice_terms_code: code,
        approved_invoice_orders_allowed: invoiceAllowed,
        updated_at: now,
      })
      .eq("id", appId)
      .select("*")
      .single();
    if (error) return { application: null, error: error.message, status: 500 };

    const { error: coErr } = await gcSchema(supabase)
      .from("companies")
      .update({
        net_terms_status: "approved",
        credit_limit: approvedLimit,
        invoice_terms_code: code,
        invoice_terms_custom: code === "custom" ? String(custom).trim() : null,
        invoice_orders_allowed: invoiceAllowed,
        net_terms_internal_notes:
          payload.internal_notes != null ? String(payload.internal_notes) : null,
        net_terms_reviewed_at: now,
        net_terms_reviewed_by_user_id: adminUserId,
        updated_at: now,
      })
      .eq("id", row.company_id);

    if (coErr) return { application: null, error: coErr.message, status: 500 };

    const applicantId = row.applicant_user_id != null ? String(row.applicant_user_id) : null;
    if (applicantId) {
      const { data: applicant } = await supabase.from("users").select("id").eq("id", applicantId).maybeSingle();
      if (applicant) {
        const { error: userErr } = await supabase
          .from("users")
          .update({
            is_approved: 1,
            payment_terms: "net30",
            updated_at: now,
          })
          .eq("id", applicantId);
        if (userErr) return { application: null, error: userErr.message, status: 500 };
      }
    }

    return { application: mapApplicationRow(data as Record<string, unknown>), error: null, status: 200 };
  }

  if (action === "resume") {
    if (row.status !== "on_hold") {
      return { application: null, error: "Only on_hold applications can be resumed", status: 400 };
    }
    const { data, error } = await gcSchema(supabase)
      .from("net_terms_applications")
      .update({
        status: "pending",
        updated_at: now,
      })
      .eq("id", appId)
      .select("*")
      .single();
    if (error) return { application: null, error: error.message, status: 500 };
    return { application: mapApplicationRow(data as Record<string, unknown>), error: null, status: 200 };
  }

  return { application: null, error: "Invalid action (approve, deny, hold, resume)", status: 400 };
}
