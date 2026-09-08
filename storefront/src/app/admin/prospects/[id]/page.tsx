import Link from "next/link";
import { notFound } from "next/navigation";
import { ErrorState, PageHeader, PremiumSectionCard, StatusBadge } from "@/components/admin";
import { adminLink, adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { prospectStatusRequiresAction } from "@/lib/admin/launch-ops-status";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { ProspectStatusForm } from "./ProspectStatusForm";

export const dynamic = "force-dynamic";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-xs font-semibold uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className={cn(adminTableCell, "text-sm")}>{children}</dd>
    </>
  );
}

export default async function AdminProspectDetailPage({ params }: { params: { id: string } }) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Pricing lead" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) notFound();

  const prospectId = Number(params.id);
  if (!Number.isFinite(prospectId)) notFound();

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = await supabase
    .from("sales_prospects")
    .select(
      "id, company_name, contact_name, email, phone, source, status, notes, created_at, updated_at, last_contacted_at",
    )
    .eq("id", prospectId)
    .maybeSingle();

  if (error) {
    return (
      <div>
        <PageHeader title="Pricing lead" breadcrumb={[{ label: "Pricing leads", href: "/admin/prospects" }]} />
        <ErrorState title="Could not load lead" message={error.message} />
      </div>
    );
  }
  if (!data) notFound();

  const prospect = data as {
    id: number;
    company_name: string;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    source: string | null;
    status: string;
    notes: string | null;
    created_at: string;
    updated_at: string;
    last_contacted_at: string | null;
  };
  return (
    <div>
      <PageHeader
        title={prospect.company_name}
        description={`Lead #${prospect.id}`}
        breadcrumb={[{ label: "Pricing leads", href: "/admin/prospects" }, { label: prospect.company_name }]}
      />

      <PremiumSectionCard title="Contact">
        <dl className="grid gap-3 sm:grid-cols-2">
          <Field label="Status">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={prospect.status} />
              {prospectStatusRequiresAction(prospect.status) ? (
                <span className="text-xs font-medium text-admin-warning">Needs action</span>
              ) : null}
            </div>
          </Field>
          <Field label="Source">{prospect.source ?? "—"}</Field>
          <Field label="Contact">{prospect.contact_name ?? "—"}</Field>
          <Field label="Email">
            {prospect.email ? (
              <a href={`mailto:${prospect.email}`} className={adminLink}>
                {prospect.email}
              </a>
            ) : (
              "—"
            )}
          </Field>
          <Field label="Phone">{prospect.phone ?? "—"}</Field>
          <Field label="Created">{new Date(prospect.created_at).toLocaleString()}</Field>
          <Field label="Updated">{new Date(prospect.updated_at).toLocaleString()}</Field>
          <Field label="Last contacted">
            {prospect.last_contacted_at ? new Date(prospect.last_contacted_at).toLocaleString() : "—"}
          </Field>
        </dl>
        {prospect.notes ? (
          <div className="mt-4 border-t border-admin-border-subtle pt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-admin-secondary">{prospect.notes}</p>
          </div>
        ) : null}
        <ProspectStatusForm prospectId={prospect.id} currentStatus={prospect.status} />
      </PremiumSectionCard>

      <Link href="/admin/prospects" className={cn("mt-4 inline-block text-sm", adminLink)}>
        ← Pricing leads
      </Link>
    </div>
  );
}
