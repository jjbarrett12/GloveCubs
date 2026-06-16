import { PageHeader, PageSection } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { fetchAdminContactMessages } from "@/lib/admin/admin-contact-messages";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Messages | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminMessagesPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Contact messages" description="Sign in as an admin operator." />
      </div>
    );
  }

  if (!isSupabaseConfigured()) {
    return (
      <div>
        <PageHeader title="Contact messages" description="Supabase is not configured." />
      </div>
    );
  }

  const { rows, error } = await fetchAdminContactMessages();

  return (
    <div>
      <PageHeader
        title="Contact messages"
        description="Read-only inbox from the public contact form (Supabase contact_messages). No mark-handled workflow in this phase."
      />

      {error ? <p className="mb-4 text-sm text-red-600">{error}</p> : null}

      <PageSection title={`Submissions (${rows.length})`}>
        {rows.length === 0 ? (
          <p className="text-sm text-gray-500">No contact form submissions yet.</p>
        ) : (
          <div className="space-y-4">
            {rows.map((m) => (
              <article key={m.id} className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div>
                    <strong className="text-gray-900">{m.name || "—"}</strong>
                    {m.company ? <span className="text-gray-600"> · {m.company}</span> : null}
                  </div>
                  <time className="text-xs text-gray-500">{new Date(m.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-1 text-sm">
                  <a href={`mailto:${m.email}`} className="text-blue-700 hover:underline">
                    {m.email || "—"}
                  </a>
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-gray-700">{m.message || "—"}</p>
              </article>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
