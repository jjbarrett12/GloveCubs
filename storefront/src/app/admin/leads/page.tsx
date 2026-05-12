import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { PageHeader, TableCard, EmptyState } from "@/components/admin";

export const dynamic = "force-dynamic";

type QuoteRow = {
  id: string;
  contact_name: string;
  email: string;
  company_name: string;
  phone: string | null;
  created_at: string;
};

export default async function AdminLeadsPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Quotes / Leads" description="Supabase not configured." />
        <div className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to load quote requests.
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = (await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select("id, contact_name, email, company_name, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(100)) as { data: QuoteRow[] | null; error: { message: string } | null };

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Quotes / Leads"
        description="Recent rows from catalogos.quote_requests (newest 100)."
      />

      {error ? (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error.message}
        </div>
      ) : null}

      <TableCard>
        {rows.length === 0 ? (
          <EmptyState
            title="No quote requests yet"
            description="Inbound quote requests will land here when they hit catalogos.quote_requests."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-gray-200 bg-gray-50 text-xs font-medium uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="p-3">Created</th>
                  <th className="p-3">Quote id</th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Phone</th>
                  <th className="p-3">Company</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((r) => (
                  <tr key={r.id} className="hover:bg-blue-50/40">
                    <td className="whitespace-nowrap p-3 text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3 font-mono text-xs text-gray-500">{r.id}</td>
                    <td className="p-3 text-gray-900">{r.contact_name}</td>
                    <td className="p-3 text-gray-900">{r.email}</td>
                    <td className="p-3 text-gray-600">{r.phone ?? "—"}</td>
                    <td className="p-3 text-gray-900">{r.company_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </div>
  );
}
