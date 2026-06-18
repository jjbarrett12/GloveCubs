import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CustomerDetailHeader,
  CustomerDetailMetrics,
  CustomerDetailTabNav,
  EmptyState,
  ErrorState,
  PageHeader,
  PlaceholderPanel,
  PremiumSectionCard,
  StatusBadge,
  TableCard,
} from "@/components/admin";
import { DetailTableShell, adminTableRowHover } from "@/components/admin/DetailTableShell";
import { adminLink, adminTableCell } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
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

function SummaryDt({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-admin-muted">{label}</dt>
      <dd className="mt-0.5 text-sm text-admin-primary">{children}</dd>
    </div>
  );
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
        <PageHeader
          title="Customer detail"
          breadcrumb={[{ label: "Customers", href: "/admin/companies" }]}
        />
        <ErrorState title="Could not load customer" message={error} />
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
      <nav className="mb-4 text-sm" aria-label="Breadcrumb">
        <Link href="/admin/companies" className={adminLink}>
          Customers
        </Link>
        <span className="mx-1.5 text-admin-muted">/</span>
        <span className="text-admin-primary">{company.trade_name}</span>
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
            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryDt label="Customer account ID">
                <span className="font-mono text-xs">{company.id}</span>
              </SummaryDt>
              <SummaryDt label="Country">{company.country_code ?? "—"}</SummaryDt>
              <SummaryDt label="Created">{new Date(company.created_at).toLocaleString()}</SummaryDt>
              <SummaryDt label="Updated">{new Date(company.updated_at).toLocaleString()}</SummaryDt>
            </dl>
          </PremiumSectionCard>

          <PremiumSectionCard
            title="Activity preview"
            description="Recent quote and order records — operational only, not revenue or margin reporting."
          >
            <div className="grid gap-5 lg:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Quote requests</h4>
                  <Link href={`/admin/companies/${companyId}?tab=activity`} scroll={false} className={cn("text-xs font-semibold", adminLink)}>
                    View all
                  </Link>
                </div>
                <TableCard>
                  {previewQuotes.length === 0 ? (
                    <EmptyState title="No linked quote requests" className="py-6" />
                  ) : (
                    <DetailTableShell headers={[{ label: "Status" }, { label: "Contact" }, { label: "Submitted" }]}>
                      {previewQuotes.map((q) => (
                        <tr key={q.id} className={adminTableRowHover}>
                          <td className={cn(adminTableCell, "px-3 py-2")}>
                            <StatusBadge status={q.status} />
                          </td>
                          <td className={cn(adminTableCell, "px-3 py-2")}>
                            {[q.contact_name, q.email].filter(Boolean).join(" · ") || "—"}
                          </td>
                          <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>
                            {q.submitted_at
                              ? new Date(q.submitted_at).toLocaleString()
                              : new Date(q.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </DetailTableShell>
                  )}
                </TableCard>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Order records</h4>
                  <Link
                    href={`/admin/orders?company_id=${encodeURIComponent(companyId)}`}
                    className={cn("text-xs font-semibold", adminLink)}
                  >
                    View order records
                  </Link>
                </div>
                <TableCard>
                  {previewOrders.length === 0 ? (
                    <EmptyState title="No order records" className="py-6" />
                  ) : (
                    <DetailTableShell headers={[{ label: "Order #" }, { label: "Status" }, { label: "Placed" }]}>
                      {previewOrders.map((o) => (
                        <tr key={o.id} className={adminTableRowHover}>
                          <td className={cn(adminTableCell, "px-3 py-2 font-mono")}>{o.order_number}</td>
                          <td className={cn(adminTableCell, "px-3 py-2")}>
                            <StatusBadge status={o.status} />
                          </td>
                          <td className={cn(adminTableCell, "px-3 py-2 text-xs")}>
                            {new Date(o.placed_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </DetailTableShell>
                  )}
                </TableCard>
              </div>
            </div>
          </PremiumSectionCard>

          {latest_quote_contact?.email || latest_quote_contact?.contact_name ? (
            <p className="text-xs text-admin-muted">
              Latest quote contact (snapshot):{" "}
              <span className="font-medium text-admin-secondary">
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
            <ErrorState title="Could not load delivery locations" message={shipTos.error} className="py-6" />
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
                <EmptyState title="No linked quote requests" />
              ) : (
                <DetailTableShell
                  headers={[{ label: "Status" }, { label: "Contact" }, { label: "Lines" }, { label: "Submitted" }]}
                >
                  {recent_quotes.map((q) => (
                    <tr key={q.id} className={adminTableRowHover}>
                      <td className={cn(adminTableCell, "px-4 py-2.5")}>
                        <StatusBadge status={q.status} />
                      </td>
                      <td className={cn(adminTableCell, "px-4 py-2.5")}>
                        {[q.contact_name, q.email].filter(Boolean).join(" · ") || "—"}
                      </td>
                      <td className={cn(adminTableCell, "px-4 py-2.5 tabular-nums")}>{q.line_count}</td>
                      <td className={cn(adminTableCell, "px-4 py-2.5 text-xs")}>
                        {q.submitted_at
                          ? new Date(q.submitted_at).toLocaleString()
                          : new Date(q.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </DetailTableShell>
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
                className={cn("text-sm font-semibold", adminLink)}
              >
                View order records
              </Link>
            </div>
            <TableCard>
              {recent_orders.length === 0 ? (
                <EmptyState title="No order records" />
              ) : (
                <DetailTableShell
                  headers={[
                    { label: "Order #" },
                    { label: "Status" },
                    { label: "Placed" },
                    { label: "View" },
                  ]}
                >
                  {recent_orders.map((o) => (
                    <tr key={o.id} className={adminTableRowHover}>
                      <td className={cn(adminTableCell, "px-4 py-2.5 font-mono")}>{o.order_number}</td>
                      <td className={cn(adminTableCell, "px-4 py-2.5")}>
                        <StatusBadge status={o.status} />
                      </td>
                      <td className={cn(adminTableCell, "px-4 py-2.5 text-xs")}>
                        {new Date(o.placed_at).toLocaleString()}
                      </td>
                      <td className={cn(adminTableCell, "px-4 py-2.5")}>
                        <Link href={`/admin/orders/${o.id}`} className={cn("text-xs font-medium", adminLink)}>
                          Open
                        </Link>
                      </td>
                    </tr>
                  ))}
                </DetailTableShell>
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
                <EmptyState title="No team members" description="No team members linked to this customer account." />
              ) : (
                <DetailTableShell
                  headers={[{ label: "Role" }, { label: "Email" }, { label: "User ID" }, { label: "Joined" }]}
                >
                  {members.map((m) => (
                    <tr key={m.id} className={adminTableRowHover}>
                      <td className={cn(adminTableCell, "px-4 py-2.5 capitalize")}>{m.role}</td>
                      <td className={cn(adminTableCell, "px-4 py-2.5")}>{m.email ?? "—"}</td>
                      <td className={cn(adminTableCell, "px-4 py-2.5 font-mono text-xs text-admin-muted")}>{m.user_id}</td>
                      <td className={cn(adminTableCell, "px-4 py-2.5 text-xs")}>
                        {new Date(m.joined_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </DetailTableShell>
              )}
            </TableCard>
          </PremiumSectionCard>

          <PlaceholderPanel title="Invites coming soon">
            <p>Self-service invites and role management for team access are not enabled in this phase.</p>
            <p className="text-admin-muted">Operators continue to manage access through your established identity processes.</p>
          </PlaceholderPanel>
        </div>
      ) : null}

      {tab === "billing" ? (
        <div className="space-y-5">
          <PremiumSectionCard title="Online payments" description="Card capture and saved payment methods are not available here.">
            <PlaceholderPanel title="Not enabled">
              <p>Online payment setup is not enabled yet. Do not enter card details in the admin workspace.</p>
              <p className="text-admin-muted">
                When enabled, payment setup will use hosted provider flows only (no raw card data in GloveCubs).
              </p>
            </PlaceholderPanel>
          </PremiumSectionCard>

          <PremiumSectionCard title="Billing profile" description="Accounts payable context for this customer account.">
            <PlaceholderPanel title="Future phase">
              <p>Billing workflows will be configured in a future phase.</p>
              <p className="text-admin-muted">There is no billing address or terms editor connected to this screen yet.</p>
            </PlaceholderPanel>
          </PremiumSectionCard>
        </div>
      ) : null}
    </div>
  );
}
