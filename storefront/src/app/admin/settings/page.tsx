import { PageHeader, StatusBadge } from "@/components/admin";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | GloveCubs admin",
  robots: { index: false, follow: false },
};

function Row({ label, value, on }: { label: string; value: string; on: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 px-4 py-3 last:border-b-0">
      <dt className="text-sm text-gray-600">{label}</dt>
      <dd className="flex items-center gap-2 text-sm">
        <StatusBadge status={on ? "enabled" : "disabled"} />
        <span className="font-mono text-xs text-gray-500">{value}</span>
      </dd>
    </div>
  );
}

export default function AdminSettingsPage() {
  const supabasePublic = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
  const serviceConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const catalogOsPublic = Boolean(process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim());
  const catalogOsInternal = Boolean(process.env.CATALOGOS_INTERNAL_URL?.trim());
  const internalKey = Boolean(process.env.INTERNAL_API_KEY?.trim());
  const deployEnv =
    process.env.VERCEL_ENV?.trim() || (process.env.NODE_ENV === "production" ? "production" : "development");

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Environment signals safe to show operators (no secret values)."
      />

      <section className="mb-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Authorization model</h2>
        <p className="mt-2 text-sm leading-relaxed text-gray-700">
          Admin pages require a Supabase-authenticated user with an active row in{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">public.admin_users</code> where{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">id</code> equals{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">auth.users.id</code> (not a
          separately generated UUID; email-only inserts will not match sign-in) and{" "}
          <code className="rounded bg-gray-100 px-1 py-0.5 font-mono text-xs text-gray-800">is_active</code> is true. There
          is no shared query-secret gate for normal navigation.
        </p>
      </section>

      <section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <header className="border-b border-gray-200 bg-gray-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-900">Environment</h2>
        </header>
        <dl>
          <Row label="Deployment" value={deployEnv} on />
          <Row label="Supabase client (public URL + anon)" value={supabasePublic ? "configured" : "not configured"} on={supabasePublic} />
          <Row label="Supabase service role (server)" value={serviceConfigured ? "configured" : "not configured"} on={serviceConfigured} />
          <Row label="CatalogOS internal URL (server import proxies)" value={catalogOsInternal ? "configured" : "not configured"} on={catalogOsInternal} />
          <Row label="Internal API key (server)" value={internalKey ? "set" : "not set"} on={internalKey} />
          <Row label="CatalogOS public URL" value={catalogOsPublic ? "configured" : "not configured"} on={catalogOsPublic} />
        </dl>
      </section>
    </div>
  );
}
