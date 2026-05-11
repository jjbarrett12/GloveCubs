import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

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
    return <p className="text-white/70">Supabase not configured.</p>;
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
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Quotes / Leads</h1>
        <p className="mt-2 text-sm text-white/60">Recent rows from catalogos.quote_requests (newest 100).</p>
      </div>
      {error ? <p className="text-sm text-amber-200">{error.message}</p> : null}
      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <thead className="bg-white/5 text-white/70">
            <tr>
              <th className="p-3 font-medium">Created</th>
              <th className="p-3 font-medium">Quote id</th>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Phone</th>
              <th className="p-3 font-medium">Company</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-white/10 text-white">
                <td className="whitespace-nowrap p-3 text-white/60">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-3 font-mono text-xs text-white/80">{r.id}</td>
                <td className="p-3">{r.contact_name}</td>
                <td className="p-3">{r.email}</td>
                <td className="p-3 text-white/70">{r.phone ?? "—"}</td>
                <td className="p-3">{r.company_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && !error ? <p className="text-sm text-white/50">No quote requests yet.</p> : null}
    </div>
  );
}
