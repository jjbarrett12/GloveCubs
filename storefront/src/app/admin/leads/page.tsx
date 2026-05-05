import Link from "next/link";
import { notFound } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

type QuoteRow = {
  id: string;
  contact_name: string;
  email: string;
  company_name: string;
  created_at: string;
};

export default async function AdminLeadsPage({
  searchParams,
}: {
  searchParams: { secret?: string };
}) {
  const gate = process.env.ADMIN_LEADS_SECRET?.trim();
  const prod = isProduction();

  if (prod) {
    if (!gate) {
      notFound();
    }
    if (searchParams.secret !== gate) {
      notFound();
    }
  } else if (gate && searchParams.secret !== gate) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] p-10 text-white">
        <p className="text-white/70">
          Unauthorized. Pass <code className="text-white">?secret=…</code> matching ADMIN_LEADS_SECRET.
        </p>
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div className="min-h-screen bg-[hsl(var(--background))] p-10 text-white">
        <p>Supabase not configured.</p>
      </div>
    );
  }

  const supabase = getSupabaseAdmin() as any;
  const { data, error } = (await supabase
    .schema("catalogos")
    .from("quote_requests")
    .select("id, contact_name, email, company_name, created_at")
    .order("created_at", { ascending: false })
    .limit(100)) as { data: QuoteRow[] | null; error: { message: string } | null };

  const rows = data ?? [];

  return (
    <div className="min-h-screen bg-[hsl(var(--background))]">
      <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
        <Link href="/" className="text-white font-semibold">
          GloveCubs
        </Link>
        <span className="text-white/50 text-sm">Quote requests</span>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-white mb-6">Leads (quote requests)</h1>
        {error && (
          <p className="text-amber-200 text-sm mb-4">{error.message}</p>
        )}
        <div className="overflow-x-auto border border-white/10 rounded-xl">
          <table className="w-full text-sm text-left">
            <thead className="bg-white/5 text-white/70">
              <tr>
                <th className="p-3 font-medium">Created</th>
                <th className="p-3 font-medium">Name</th>
                <th className="p-3 font-medium">Email</th>
                <th className="p-3 font-medium">Company</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/10 text-white">
                  <td className="p-3 text-white/60 whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                  <td className="p-3">{r.contact_name}</td>
                  <td className="p-3">{r.email}</td>
                  <td className="p-3">{r.company_name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && !error && (
          <p className="text-white/50 mt-4 text-sm">No quote requests yet.</p>
        )}
      </main>
    </div>
  );
}
