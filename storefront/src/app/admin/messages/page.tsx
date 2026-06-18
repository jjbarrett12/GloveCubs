import Link from "next/link";
import { EmptyState, ErrorState, PageHeader, PageSection } from "@/components/admin";
import { adminCardSurface, adminLink } from "@/components/admin/admin-theme-utils";
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
        <PageHeader title="Contact messages" description="Read-only inbox from the public contact form." />
        <ErrorState
          title="Database not configured"
          message="Contact messages cannot be loaded in this environment. Review Admin Health for configuration status."
        />
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

      {error ? <ErrorState title="Could not load messages" message={error} /> : null}

      <PageSection title={`Submissions (${rows.length})`}>
        {rows.length === 0 && !error ? (
          <EmptyState
            title="No contact form submissions yet"
            description="Messages from the public contact form will appear here when submitted."
          />
        ) : (
          <div className="space-y-4">
            {rows.map((m) => (
              <article key={m.id} className={`${adminCardSurface} p-4`}>
                <div className="flex flex-wrap items-start justify-between gap-2 text-sm">
                  <div>
                    <strong className="text-admin-primary">{m.name || "—"}</strong>
                    {m.company ? <span className="text-admin-secondary"> · {m.company}</span> : null}
                  </div>
                  <time className="text-xs text-admin-muted">{new Date(m.created_at).toLocaleString()}</time>
                </div>
                <p className="mt-1 text-sm">
                  <a href={`mailto:${m.email}`} className={adminLink}>
                    {m.email || "—"}
                  </a>
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm text-admin-secondary">{m.message || "—"}</p>
              </article>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
