import { PageHeader, StatusBadge } from "@/components/admin";
import { AdminHealthBanner } from "@/components/admin/AdminHealthBanner";
import { AdminThemeAppearanceSection } from "@/app/admin/_components/AdminThemeAppearanceSection";
import {
  adminAlertSurface,
  adminCardSurface,
  adminMutedPanel,
} from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";
import {
  MODULE_IMPACT_ROWS,
  resolveAdminHealth,
  type AdminHealthIntegration,
  type AdminHealthStatus,
} from "@/lib/admin/admin-health";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Settings | GloveCubs admin",
  robots: { index: false, follow: false },
};

function statusLabel(status: AdminHealthStatus): string {
  return status.replace(/_/g, " ");
}

function IntegrationRow({ integration }: { integration: AdminHealthIntegration }) {
  return (
    <div className="border-b border-admin-border-subtle px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-admin-primary">{integration.label}</p>
          <p className="mt-1 text-xs leading-relaxed text-admin-secondary">{integration.description}</p>
          {integration.settingsEnvHint ? (
            <p className="mt-2 text-xs text-admin-muted">
              Env: <span className="font-mono">{integration.settingsEnvHint}</span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <StatusBadge status={integration.configured ? "enabled" : "disabled"} />
          <span className="text-xs capitalize text-admin-muted">{statusLabel(integration.status)}</span>
        </div>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const health = resolveAdminHealth();
  const catalogosConfigured = health.integrations.find((i) => i.id === "catalogos")?.configured ?? false;
  const importKeyConfigured = health.integrations.find((i) => i.id === "import_internal_key")?.configured ?? false;
  const optionalImportUnconfigured = !catalogosConfigured && !importKeyConfigured;

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Environment status for this deployment. Values are on/off only—no secrets are shown."
      />

      <section id="health" className="mb-6 scroll-mt-6 overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm">
        <header className="border-b border-admin-border bg-admin-surface-muted px-4 py-3">
          <h2 className="text-sm font-semibold text-admin-primary">Admin Health</h2>
          <p className="mt-1 text-xs text-admin-secondary">
            Overall status:{" "}
            <span className="font-medium capitalize text-admin-primary">{statusLabel(health.status)}</span>
            {" · "}
            Deployment: <span className="font-mono">{health.deployEnv}</span>
          </p>
        </header>

        {health.issues.length > 0 ? (
          <div className="border-b border-admin-border-subtle p-4">
            <AdminHealthBanner issues={health.issues} scope="settings" />
          </div>
        ) : (
          <p className="border-b border-admin-border-subtle px-4 py-3 text-sm text-admin-success">
            All checked integrations are configured for this environment.
          </p>
        )}

        <div className="divide-y divide-admin-border-subtle">
          {health.integrations.map((integration) => (
            <IntegrationRow key={integration.id} integration={integration} />
          ))}
        </div>

        <div className="border-t border-admin-border-subtle px-4 py-3">
          <p className="text-sm font-medium text-admin-primary">CatalogOS / import (optional)</p>
          <p className="mt-1 text-xs leading-relaxed text-admin-secondary">
            {optionalImportUnconfigured ? "Not configured. " : ""}
            These power supplier URL import and catalog sync only. The live storefront and admin reads do not depend on
            them.
          </p>
        </div>
      </section>

      <AdminThemeAppearanceSection />

      <section className="mb-6 overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm">
        <header className="border-b border-admin-border bg-admin-surface-muted px-4 py-3">
          <h2 className="text-sm font-semibold text-admin-primary">Module impact</h2>
          <p className="mt-1 text-xs text-admin-secondary">Which admin modules depend on each integration.</p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead className="border-b border-admin-border-subtle bg-admin-surface-muted text-xs font-semibold uppercase tracking-wide text-admin-muted">
              <tr>
                <th className="px-4 py-2">Module</th>
                <th className="px-4 py-2">Requires</th>
              </tr>
            </thead>
            <tbody>
              {MODULE_IMPACT_ROWS.map((row) => (
                <tr key={row.moduleId} className="border-b border-admin-border-subtle last:border-0">
                  <td className="px-4 py-2.5 font-medium text-admin-primary">{row.label}</td>
                  <td className="px-4 py-2.5 text-admin-secondary">{row.requires}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={cn(adminCardSurface, "mb-6 p-4")}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Local development</h2>
        <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
          Purchase orders, buyer users, net terms, and inventory load directly from Supabase. Order ship/status, invoice
          payment, and create PO are paused while these actions migrate from the legacy bridge to native GloveCubs
          fulfillment — this is an intentional limitation, not a missing configuration.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
          Supabase keys are required for dashboard, catalog, customers, orders, and messages. Run{" "}
          <span className="font-mono text-xs">npm run env:sync</span> in the storefront folder when local Supabase keys
          are missing.
        </p>
      </section>

      {health.isProduction ? (
        <section className={cn(adminAlertSurface("warning", "mb-6"))}>
          <h2 className="text-xs font-semibold uppercase tracking-wide">Order fulfillment actions</h2>
          <p className="mt-2 text-sm leading-relaxed">
            Ship/status updates, invoice payments, and PO creation are intentionally paused while they migrate from the
            legacy bridge to native GloveCubs fulfillment. This is a planned limitation, not a deployment
            misconfiguration — no legacy environment variables need to be added. Order records, catalog, customers, and
            quoting remain fully live.
          </p>
        </section>
      ) : null}

      <section className={cn(adminCardSurface, "mb-6 p-4")}>
        <h2 className="text-xs font-semibold uppercase tracking-wide text-admin-muted">Who can use admin</h2>
        <p className="mt-2 text-sm leading-relaxed text-admin-secondary">
          Admin is limited to team accounts that are explicitly enabled. If someone can sign in but cannot reach admin,
          their profile likely is not on the allowlist yet—have an owner add them or confirm they are using the same
          email as their invite.
        </p>
        <details className={cn(adminMutedPanel, "mt-4 border-solid p-3")}>
          <summary className="cursor-pointer text-xs font-semibold text-admin-secondary">Technical details (IT)</summary>
          <p className="mt-2 text-xs leading-relaxed text-admin-muted">
            Access is tied to Supabase Auth plus an active row in the admin allowlist table keyed by the same user id
            as sign-in. Email-only placeholders without that link will not match a live session.
          </p>
        </details>
      </section>
    </div>
  );
}
