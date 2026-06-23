import Link from "next/link";
import { PageHeader, PageSection, EmptyState, ErrorState, StatusBadge } from "@/components/admin";
import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";
import {
  adminCardSurface,
  adminFormInput,
  adminFormLabel,
  adminLink,
  adminPrimaryButton,
} from "@/components/admin/admin-theme-utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getAdminModuleAvailability, resolveAdminHealth } from "@/lib/admin/admin-health";
import { fetchAdminNetTermsApplications } from "@/lib/admin/admin-net-terms";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { NetTermsActions } from "./NetTermsActions";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Net terms | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminNetTermsPage({
  searchParams,
}: {
  searchParams?: { status?: string | string[] };
}) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Net terms" description="Sign in as an admin operator." />
      </div>
    );
  }

  const raw = searchParams?.status;
  const statusFilter = (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;
  const health = resolveAdminHealth();
  const availability = getAdminModuleAvailability(health, "net-terms");

  return (
    <div>
      <PageHeader
        title="Net terms applications"
        description="Review and approve invoice/net-terms applications for B2B companies."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="net-terms" reason={availability.reason} />
      ) : (
        <NetTermsContent statusFilter={statusFilter} />
      )}
    </div>
  );
}

async function NetTermsContent({ statusFilter }: { statusFilter?: string }) {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorState
        title="Could not load net terms applications"
        message="Database credentials are not configured. Review Admin Health for configuration status."
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const { applications, error, status } = await fetchAdminNetTermsApplications(supabase, statusFilter);

  if (error) {
    return (
      <ErrorState
        title="Could not load net terms applications"
        message={status >= 500 ? "This module could not be loaded. Try again in a moment." : error}
      />
    );
  }

  return (
    <>
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className={adminFormLabel}>Status filter</label>
          <select name="status" defaultValue={statusFilter ?? ""} className={adminFormInput}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="on_hold">On hold</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
          </select>
        </div>
        <button type="submit" className={adminPrimaryButton}>
          Apply
        </button>
      </form>

      <PageSection title={`Applications (${applications.length})`}>
        {applications.length === 0 ? (
          <EmptyState
            title="No applications matched"
            description="Net terms applications will appear here when buyers submit them through the portal."
          />
        ) : (
          <div className="space-y-4">
            {applications.slice(0, 80).map((a) => (
              <div key={a.id} className={`${adminCardSurface} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-admin-primary">
                      {a.company_name || "Company"} — {a.business_name || a.contact_name || "Applicant"}
                    </p>
                    <p className="text-xs text-admin-secondary">
                      {a.applicant_email || a.email || "—"} · submitted{" "}
                      {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                    </p>
                    {a.company_id ? (
                      <p className="mt-1 text-xs">
                        <Link href={`/admin/companies/${a.company_id}`} className={adminLink}>
                          Open company
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge status={a.status} />
                </div>
                {a.decision_notes ? (
                  <p className="mt-2 text-xs text-admin-secondary">Notes: {a.decision_notes}</p>
                ) : null}
                <NetTermsActions applicationId={a.id} status={a.status} />
              </div>
            ))}
            {applications.length > 80 ? (
              <p className="text-xs text-admin-muted">Showing first 80 applications.</p>
            ) : null}
          </div>
        )}
      </PageSection>
    </>
  );
}
