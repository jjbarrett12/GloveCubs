export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default function AdminSettingsPage() {
  const supabasePublic = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim(),
  );
  const serviceConfigured = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim(),
  );
  const catalogOs = Boolean(process.env.NEXT_PUBLIC_CATALOGOS_URL?.trim());
  const deployEnv =
    process.env.VERCEL_ENV?.trim() || (process.env.NODE_ENV === "production" ? "production" : "development");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="mt-2 text-sm text-white/60">Environment signals safe to show operators (no secret values).</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/80">
        <h2 className="text-xs font-bold uppercase tracking-wide text-white/45">Authorization model</h2>
        <p className="mt-2 leading-relaxed">
          Admin pages require a Supabase-authenticated user with an active row in{" "}
          <code className="text-white/70">public.admin_users</code> (<code className="text-white/70">id</code> matches
          auth user, <code className="text-white/70">is_active = true</code>). There is no shared query-secret gate for
          normal navigation.
        </p>
      </div>

      <dl className="grid gap-3 rounded-xl border border-white/10 bg-[#141414] p-4 text-sm">
        <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
          <dt className="text-white/50">Deployment</dt>
          <dd className="font-mono text-white">{deployEnv}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
          <dt className="text-white/50">Supabase client (public URL + anon)</dt>
          <dd className="text-white">{supabasePublic ? "configured" : "not configured"}</dd>
        </div>
        <div className="flex justify-between gap-4 border-b border-white/10 pb-2">
          <dt className="text-white/50">Supabase service role (server)</dt>
          <dd className="text-white">{serviceConfigured ? "configured" : "not configured"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-white/50">CatalogOS public URL</dt>
          <dd className="text-white">{catalogOs ? "configured" : "not configured"}</dd>
        </div>
      </dl>
    </div>
  );
}
