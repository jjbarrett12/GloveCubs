import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { PageHeader, TableCard, EmptyState } from "@/components/admin";
import { formatShipToLabel } from "@/lib/commerce/ship-to-address-format";

export const dynamic = "force-dynamic";

type QuoteRow = {
  id: string;
  contact_name: string;
  email: string;
  company_name: string;
  phone: string | null;
  created_at: string;
  ship_to_address_id: string | null;
  ship_to_label: string | null;
  ship_to_snapshot: unknown | null;
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
    .select(
      "id, contact_name, email, company_name, phone, created_at, ship_to_address_id, ship_to_label, ship_to_snapshot",
    )
    .order("created_at", { ascending: false })
    .limit(100)) as { data: QuoteRow[] | null; error: { message: string } | null };

  const rows = data ?? [];

  return (
    <div>
      <PageHeader
        title="Quotes / Leads"
        description="Recent quote requests (newest 100)."
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
            description="Inbound quote requests appear here as soon as buyers submit them from the storefront."
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
                  <th className="p-3">Requested delivery location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {rows.map((r) => {
                  const hasSnap = r.ship_to_snapshot != null;
                  const warnIdNoSnap = Boolean(r.ship_to_address_id) && !hasSnap;
                  const deliveryText = hasSnap
                    ? formatShipToLabel(r.ship_to_label, r.ship_to_snapshot)
                    : "—";
                  return (
                  <tr key={r.id} className="hover:bg-blue-50/40">
                    <td className="whitespace-nowrap p-3 text-gray-600">{new Date(r.created_at).toLocaleString()}</td>
                    <td className="p-3 font-mono text-xs text-gray-500">{r.id}</td>
                    <td className="p-3 text-gray-900">{r.contact_name}</td>
                    <td className="p-3 text-gray-900">{r.email}</td>
                    <td className="p-3 text-gray-600">{r.phone ?? "—"}</td>
                    <td className="p-3 text-gray-900">{r.company_name}</td>
                    <td className="max-w-[280px] p-3 align-top text-gray-800">
                      <p className="text-sm">{deliveryText}</p>
                      {warnIdNoSnap ? (
                        <p className="mt-1 text-xs font-medium text-amber-800">
                          Warning: ship_to_address_id present but quote-time snapshot is missing — do not rely on the
                          live address book for this request.
                        </p>
                      ) : null}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </TableCard>
    </div>
  );
}
