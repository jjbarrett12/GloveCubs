import Link from "next/link";
import { PageHeader, PageSection } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminNetTermsApplicationsFromExpress } from "@/lib/admin/admin-net-terms-express";
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
  const { applications, error, status } = await fetchAdminNetTermsApplicationsFromExpress(operator, statusFilter);

  return (
    <div>
      <PageHeader
        title="Net terms applications"
        description="Review and approve invoice/net-terms applications. Decisions use the transitional Express admin API."
      />

      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600">Status filter</label>
          <select name="status" defaultValue={statusFilter ?? ""} className="mt-1 rounded border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="on_hold">On hold</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
          </select>
        </div>
        <button type="submit" className="rounded-md bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
          Apply
        </button>
      </form>

      {error ? (
        <p className="mb-4 text-sm text-red-600" role="alert">
          {error}
          {status === 503 ? " — check JWT_SECRET and NEXT_PUBLIC_GLOVECUBS_API." : null}
        </p>
      ) : null}

      <PageSection title={`Applications (${applications.length})`}>
        {applications.length === 0 ? (
          <p className="text-sm text-gray-500">No applications matched.</p>
        ) : (
          <div className="space-y-4">
            {applications.slice(0, 80).map((a) => (
              <div key={a.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-gray-900">
                      {a.company_name || "Company"} — {a.business_name || a.contact_name || "Applicant"}
                    </p>
                    <p className="text-xs text-gray-600">
                      {a.applicant_email || a.email || "—"} · submitted{" "}
                      {a.created_at ? new Date(a.created_at).toLocaleString() : "—"}
                    </p>
                    {a.company_id ? (
                      <p className="mt-1 text-xs">
                        <Link href={`/admin/companies/${a.company_id}`} className="text-blue-700 hover:underline">
                          Open company
                        </Link>
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-gray-700">
                    {a.status}
                  </span>
                </div>
                {a.decision_notes ? (
                  <p className="mt-2 text-xs text-gray-600">Notes: {a.decision_notes}</p>
                ) : null}
                <NetTermsActions applicationId={a.id} status={a.status} />
              </div>
            ))}
            {applications.length > 80 ? (
              <p className="text-xs text-gray-500">Showing first 80 applications.</p>
            ) : null}
          </div>
        )}
      </PageSection>
    </div>
  );
}
