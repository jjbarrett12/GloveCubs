import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CustomerDetailHeader,
  CustomerDetailMetrics,
  CustomerDetailTabNav,
  PageHeader,
  PlaceholderPanel,
  PremiumSectionCard,
  TableCard,
} from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { fetchAdminCompanyDetail } from "@/lib/admin/admin-companies-read-model";
import { fetchCompanyQuicklistItems } from "@/lib/admin/admin-company-quicklist";
import { fetchAdminShipToAddresses } from "@/lib/admin/admin-ship-to-addresses";
import { parseCustomerDetailTab } from "@/lib/admin/admin-customer-detail-tabs";
import { CompanyB2bTierSelect } from "../CompanyB2bTierSelect";
import { CompanyProfileForm } from "../CompanyProfileForm";
import { CompanyQuicklistManager } from "../CompanyQuicklistManager";
import { CompanyShipToAddressesManager } from "../CompanyShipToAddressesManager";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: { companyId: string } }) {
  return {
    title: "Customer detail | GloveCubs Admin",
    robots: { index: false, follow: false },
  };
}

function maxIso(isos: string[]): string | null {
  if (isos.length === 0) return null;
  return isos.reduce((a, b) => (a > b ? a : b));
}

function lastActivityIso(detail: {
  recent_quotes: { created_at: string; submitted_at: string | null }[];
  recent_orders: { placed_at: string }[];
}): string | null {
  const times: string[] = [];
  for (const q of detail.recent_quotes) {
    times.push(q.submitted_at || q.created_at);
  }
  for (const o of detail.recent_orders) {
    times.push(o.placed_at);
  }
  return maxIso(times);
}

export default async function AdminCompanyDetailPage({
  params,
  searchParams,
}: {
  params: { companyId: string };
  searchParams?: { tab?: string | string[] };
}) {
  const { companyId } = params;
  const rawTab = searchParams?.tab;
  const tabParam = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  const tab = parseCustomerDetailTab(tabParam);

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Customer detail" description="Supabase is not configured." />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const [detailRes, quicklist, shipTos] = await Promise.all([
    fetchAdminCompanyDetail(supabase, companyId),
    fetchCompanyQuicklistItems(supabase, companyId),
    fetchAdminShipToAddresses(supabase, companyId),
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
  const quicklistCount = quicklist.error ? 0 : quicklist.rows.length;
  const lastIso = lastActivityIso(detail);
  const lastActivityLabel = lastIso ? new Date(lastIso).toLocaleString() : "—";

  const previewQuotes = recent_quotes.slice(0, 3);
  const previewOrders = recent_orders.slice(0, 3);

  return (
    <div className="mx-auto max-w-[1480px]">
      <nav className="mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
        <Link href="/admin/companies" className="font-medium text-slate-600 hover:text-[#f06232]">
          Customers
        </Link>
        <span className="mx-1.5 text-slate-300">/</span>
        <span className="text-slate-900">{company.trade_name}</span>
      </nav>

      <CustomerDetailHeader
        companyId={companyId}
        tradeName={company.trade_name}
        slug={company.slug}
        status={company.status}
        tierCode={company.b2b_pricing_tier_code}
      />

      <CustomerDetailMetrics
        memberCount={members.length}
        quicklistCount={quicklistCount}
        quoteCount={quote_count}
        orderCount={order_count}
        lastActivityLabel={lastActivityLabel}
      />

      <CustomerDetailTabNav companyId={companyId} current={tab} />

      {tab === "overview" ? (
        <div className="space-y-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <PremiumSectionCard title="Business information" description="Legal and routing fields for this customer account.">
              <CompanyProfileForm company={company} />
            </PremiumSectionCard>
            <PremiumSectionCard
              title="Pricing tier"
              description="B2B volume tier for site-list-derived pricing. Unit math is enforced server-side."
            >
              <CompanyB2bTierSelect companyId={company.id} initialTier={company.b2b_pricing_tier_code} />
            </PremiumSectionCard>
          </div>

          <PremiumSectionCard title="Account summary" dense>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer account ID</dt>
                <dd className="mt-0.5 font-mono text-xs text-slate-800">{company.id}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Country</dt>
                <dd className="mt-0.5 text-slate-800">{company.country_code ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Created</dt>
                <dd className="mt-0.5 text-slate-800">{new Date(company.created_at).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Updated</dt>
                <dd className="mt-0.5 text-slate-800">{new Date(company.updated_at).toLocaleString()}</dd>
              </div>
            </dl>
          </PremiumSectionCard>

          <PremiumSectionCard
            title="Activity preview"
            description="Recent quote and order records — operational only, not revenue or margin reporting."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Quote requests</h4>
                  <Link
                    href={`/admin/companies/${companyId}?tab=activity`}
                    scroll={false}
                    className="text-xs font-semibold text-[#f06232] hover:underline"
                  >
                    View all
                  </Link>
                </div>
                <TableCard>
                  {previewQuotes.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">No linked quote requests.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Contact</th>
                            <th className="px-3 py-2">Submitted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewQuotes.map((q) => (
                            <tr key={q.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2 text-slate-800">{q.status}</td>
                              <td className="px-3 py-2 text-slate-700">
                                {[q.contact_name, q.email].filter(Boolean).join(" · ") || "—"}
                              </td>
                              <td className="px-3 py-2 text-xs text-slate-600">
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
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-600">Order records</h4>
                  <Link
                    href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
                    className="text-xs font-semibold text-[#f06232] hover:underline"
                  >
                    View order records
                  </Link>
                </div>
                <TableCard>
                  {previewOrders.length === 0 ? (
                    <p className="px-4 py-6 text-center text-sm text-slate-500">No order records.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          <tr>
                            <th className="px-3 py-2">Order #</th>
                            <th className="px-3 py-2">Status</th>
                            <th className="px-3 py-2">Placed</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewOrders.map((o) => (
                            <tr key={o.id} className="border-b border-slate-100 last:border-0">
                              <td className="px-3 py-2 font-mono text-slate-800">{o.order_number}</td>
                              <td className="px-3 py-2 text-slate-700">{o.status}</td>
                              <td className="px-3 py-2 text-xs text-slate-600">{new Date(o.placed_at).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </TableCard>
              </div>
            </div>
          </PremiumSectionCard>

          {latest_quote_contact?.email || latest_quote_contact?.contact_name ? (
            <p className="text-xs text-slate-500">
              Latest quote contact (snapshot):{" "}
              <span className="font-medium text-slate-700">
                {[latest_quote_contact.contact_name, latest_quote_contact.email].filter(Boolean).join(" · ")}
              </span>
            </p>
          ) : null}
        </div>
      ) : null}

      {tab === "delivery" ? (
        <PremiumSectionCard
          title="Delivery locations"
          description="Ship-to destinations for this customer account. Changes apply to operational fulfillment context only."
        >
          {shipTos.error ? (
            <p className="text-sm text-red-600">Could not load delivery locations: {shipTos.error}</p>
          ) : (
            <CompanyShipToAddressesManager companyId={companyId} initialAddresses={shipTos.rows} />
          )}
        </PremiumSectionCard>
      ) : null}

      {tab === "products" ? (
        <PremiumSectionCard
          title="Preferred products"
          description="Pricing is resolved server-side when quotes are requested. This list is separate from procurement reorder memory."
        >
          <CompanyQuicklistManager companyId={companyId} initialItems={quicklist.error ? [] : quicklist.rows} />
        </PremiumSectionCard>
      ) : null}

      {tab === "activity" ? (
        <div className="space-y-5">
          <PremiumSectionCard
            title="Quote requests"
            description="Quote requests linked to this customer account — operational records only."
          >
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
          </PremiumSectionCard>

          <PremiumSectionCard
            title="Order records"
            description="Canonical order records for this customer account — not revenue or margin reporting."
          >
            <div className="mb-3 flex justify-end">
              <Link
                href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
                className="text-sm font-semibold text-[#f06232] hover:underline"
              >
                View order records
              </Link>
            </div>
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
          </PremiumSectionCard>
        </div>
      ) : null}

      {tab === "team" ? (
        <div className="space-y-5">
          <PremiumSectionCard
            title="Team access"
            description="Member contact from auth identity — not company CRM. Rows reflect sign-in users linked to this customer account."
          >
            <TableCard>
              {members.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">No team members linked to this customer account.</p>
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
                          <td className="px-4 py-2.5 text-xs text-slate-600">{new Date(m.joined_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TableCard>
          </PremiumSectionCard>

          <PlaceholderPanel title="Invites coming soon">
            <p>Self-service invites and role management for team access are not enabled in this phase.</p>
            <p className="text-slate-500">Operators continue to manage access through your established identity processes.</p>
          </PlaceholderPanel>
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="space-y-5">
          <PremiumSectionCard title="Online payments" description="Card capture and saved payment methods are not available here.">
            <PlaceholderPanel title="Not enabled">
              <p>Online payment setup is not enabled yet. Do not enter card details in the admin workspace.</p>
              <p className="text-slate-500">When enabled, payment setup will use hosted provider flows only (no raw card data in GloveCubs).</p>
            </PlaceholderPanel>
          </PremiumSectionCard>

          <PremiumSectionCard title="Billing profile" description="Accounts payable context for this customer account.">
            <PlaceholderPanel title="Future phase">
              <p>Billing workflows will be configured in a future phase.</p>
              <p className="text-slate-500">There is no billing address or terms editor connected to this screen yet.</p>
            </PlaceholderPanel>
          </PremiumSectionCard>
        </div>
      ) : null}
    </div>
  );
}
