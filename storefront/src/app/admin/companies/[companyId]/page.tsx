import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader, PageSection, TableCard } from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminCompanyDetail } from "@/lib/admin/admin-companies-read-model";
import { fetchCompanyQuicklistItems } from "@/lib/admin/admin-company-quicklist";
import { CompanyB2bTierSelect } from "../CompanyB2bTierSelect";
import { CompanyProfileForm } from "../CompanyProfileForm";
import { CompanyQuicklistManager } from "../CompanyQuicklistManager";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { companyId: string } }) {
  return {
    title: "Customer detail | GloveCubs Admin",
    robots: { index: false, follow: false },
  };
}

export default async function AdminCompanyDetailPage({ params }: { params: { companyId: string } }) {
  const { companyId } = params;

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Customer detail" description="Supabase is not configured." />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const [detailRes, quicklist] = await Promise.all([
    fetchAdminCompanyDetail(supabase, companyId),
    fetchCompanyQuicklistItems(supabase, companyId),
  ]);

  const { detail, error } = detailRes;

  if (error) {
    return (
      <div>
        <PageHeader title="Customer detail" description="Could not load customer." />
        <p className="mt-4 text-sm text-red-600">{error}</p>
      </div>
    );
  }

  if (!detail) {
    notFound();
  }

  const { company, members, quote_count, order_count, recent_quotes, recent_orders, latest_quote_contact } = detail;

  return (
    <div>
      <PageHeader
        title={company.trade_name}
        description={`${b2bTierLabel(company.b2b_pricing_tier_code)} · ${company.status} · ${quote_count} linked quotes · ${order_count} order records`}
        breadcrumb={[
          { label: "Customers", href: "/admin/companies" },
          { label: company.trade_name },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/procurement/company/${companyId}`}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Open sourcing
            </Link>
            <Link
              href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View order records
            </Link>
            <Link
              href="/admin/companies"
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Back to customers
            </Link>
          </div>
        }
      />

      <div className="space-y-8">
        <PageSection title="Profile">
          <CompanyProfileForm company={company} />
        </PageSection>

        <PageSection title="Pricing tier">
          <p className="mb-3 text-sm text-slate-600">
            B2B volume tier for site-list-derived pricing. Unit math is enforced server-side.
          </p>
          <CompanyB2bTierSelect companyId={company.id} initialTier={company.b2b_pricing_tier_code} />
        </PageSection>

        <PageSection title="Contacts & members">
          <p className="mb-3 text-sm text-slate-600">
            Member contact from auth identity — not company CRM.
          </p>
          {latest_quote_contact?.email || latest_quote_contact?.contact_name ? (
            <p className="mb-4 text-sm text-slate-700">
              Last quote contact (snapshot):{" "}
              <span className="font-medium">
                {[latest_quote_contact.contact_name, latest_quote_contact.email].filter(Boolean).join(" · ")}
              </span>
            </p>
          ) : null}
          <TableCard>
            {members.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No members linked to this company.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Role</th>
                      <th className="px-4 py-2.5">Email</th>
                      <th className="px-4 py-2.5">User ID</th>
                      <th className="px-4 py-2.5">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.map((m) => (
                      <tr key={m.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 capitalize text-slate-800">{m.role}</td>
                        <td className="px-4 py-2.5 text-slate-700">{m.email ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{m.user_id}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {new Date(m.joined_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableCard>
        </PageSection>

        <PageSection title="Quote activity">
          <p className="mb-3 text-sm text-slate-600">
            Quote requests where <code className="text-xs">gc_company_id</code> matches this company.
          </p>
          <TableCard>
            {recent_quotes.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No linked quote requests.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Contact</th>
                      <th className="px-4 py-2.5">Lines</th>
                      <th className="px-4 py-2.5">Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_quotes.map((q) => (
                      <tr key={q.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 text-slate-800">{q.status}</td>
                        <td className="px-4 py-2.5 text-slate-700">
                          {[q.contact_name, q.email].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-800">{q.line_count}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {q.submitted_at
                            ? new Date(q.submitted_at).toLocaleString()
                            : new Date(q.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableCard>
        </PageSection>

        <PageSection title="Order activity">
          <p className="mb-3 text-sm text-slate-600">
            Canonical order records for this company — not revenue or margin reporting.
          </p>
          <TableCard>
            {recent_orders.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-slate-500">No order records.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-2.5">Order #</th>
                      <th className="px-4 py-2.5">Status</th>
                      <th className="px-4 py-2.5">Placed</th>
                      <th className="px-4 py-2.5">View</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_orders.map((o) => (
                      <tr key={o.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-4 py-2.5 font-mono text-slate-800">{o.order_number}</td>
                        <td className="px-4 py-2.5 text-slate-700">{o.status}</td>
                        <td className="px-4 py-2.5 text-xs text-slate-600">
                          {new Date(o.placed_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2.5">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="text-xs font-medium text-[#f06232] underline"
                          >
                            Open
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TableCard>
        </PageSection>

        <PageSection
          title="Glove quicklist"
          description="Pricing is resolved server-side when quotes are requested. This is separate from procurement reorder memory."
        >
          <CompanyQuicklistManager companyId={companyId} initialItems={quicklist.error ? [] : quicklist.rows} />
        </PageSection>

        <PageSection title="Payment setup">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Payment method setup is not enabled yet. Do not enter card details here. Future payment setup will use
            Stripe-hosted flows only.
          </div>
        </PageSection>
      </div>
    </div>
  );
}
