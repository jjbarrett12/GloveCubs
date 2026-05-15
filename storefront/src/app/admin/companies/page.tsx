import { PageHeader, PageSection } from "@/components/admin";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { CompanyB2bTierSelect } from "./CompanyB2bTierSelect";
import { b2bTierLabel } from "@/lib/pricing/b2b-tier-meta";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Companies | GloveCubs Admin",
  robots: { index: false, follow: false },
};

type CompanyRow = {
  id: string;
  trade_name: string;
  slug: string;
  b2b_pricing_tier_code: string;
  status: string;
};

function countByCompany(rows: { company_id?: string | null; gc_company_id?: string | null }[], key: "company_id" | "gc_company_id") {
  const m = new Map<string, number>();
  for (const r of rows) {
    const id = r[key];
    if (!id) continue;
    m.set(id, (m.get(id) ?? 0) + 1);
  }
  return m;
}

export default async function AdminCompaniesPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Companies" description="Supabase is not configured in this environment." />
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;

  const { data: companies, error: cErr } = await supabase
    .schema("gc_commerce")
    .from("companies")
    .select("id, trade_name, slug, b2b_pricing_tier_code, status")
    .order("trade_name", { ascending: true })
    .limit(500);

  if (cErr) {
    return (
      <div>
        <PageHeader title="Companies" description="Could not load companies." />
        <p className="mt-4 text-sm text-red-600">{cErr.message}</p>
      </div>
    );
  }

  const list = (companies ?? []) as CompanyRow[];

  const { data: memberRows } = await supabase.schema("gc_commerce").from("company_members").select("company_id");

  const { data: quoteRows } = await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select("gc_company_id, created_at, submitted_at")
    .not("gc_company_id", "is", null);

  const memberCounts = countByCompany((memberRows ?? []) as { company_id: string }[], "company_id");
  const quoteCounts = countByCompany((quoteRows ?? []) as { gc_company_id: string }[], "gc_company_id");

  const lastQuoteAt = new Map<string, string>();
  for (const r of (quoteRows ?? []) as { gc_company_id: string | null; created_at?: string; submitted_at?: string | null }[]) {
    const cid = r.gc_company_id;
    if (!cid) continue;
    const t = r.submitted_at || r.created_at;
    if (!t) continue;
    const prev = lastQuoteAt.get(cid);
    if (!prev || t > prev) lastQuoteAt.set(cid, t);
  }

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Canonical gc_commerce tenants: assign B2B pricing tiers and review membership and linked quote activity."
      />

      <PageSection title="Directory">
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="min-w-[720px] w-full border-collapse text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5">Company</th>
                <th className="px-3 py-2.5">Slug</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Tier</th>
                <th className="px-3 py-2.5 text-right">Members</th>
                <th className="px-3 py-2.5 text-right">Linked quotes</th>
                <th className="px-3 py-2.5">Last linked quote</th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                    No companies found.
                  </td>
                </tr>
              ) : (
                list.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2.5 font-medium text-slate-900">{c.trade_name}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{c.slug}</td>
                    <td className="px-3 py-2.5 text-slate-700">{c.status}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] text-slate-500">{b2bTierLabel(c.b2b_pricing_tier_code)}</span>
                        <CompanyB2bTierSelect companyId={c.id} initialTier={c.b2b_pricing_tier_code} />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{memberCounts.get(c.id) ?? 0}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{quoteCounts.get(c.id) ?? 0}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-xs text-slate-600">
                      {lastQuoteAt.has(c.id) ? new Date(lastQuoteAt.get(c.id)!).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Linked quotes counts rows where quote_requests.gc_company_id is set (signed-in buyer submissions). Historical
          quotes without a company link are excluded.
        </p>
      </PageSection>
    </div>
  );
}
