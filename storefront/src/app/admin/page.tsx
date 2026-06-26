import Link from "next/link";
import { AdminQueueCard } from "@/app/admin/_components/AdminQueueCard";
import { AdminRecentQuotesTable } from "@/app/admin/_components/AdminRecentQuotesTable";
import {
  AdminHealthBanner,
  ContaminationExclusionNotice,
  EmptyState,
  MetricChip,
  PageHeader,
  PageSection,
  StatCard,
  StatGrid,
  StatusBadge,
} from "@/components/admin";
import { adminCardSurface, adminFocusRing } from "@/components/admin/admin-theme-utils";
import {
  getAdminHealthShellDisplay,
  getAdminModuleAvailability,
  resolveAdminHealth,
  type AdminHealthSummary,
  type AdminModuleAvailability,
} from "@/lib/admin/admin-health";
import { fetchAdminHomeSnapshot } from "@/lib/admin/admin-home-snapshot";
import { isOrderFulfillmentAvailable } from "@/lib/admin/order-fulfillment-policy";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Command center | GloveCubs Admin",
  robots: { index: false, follow: false },
};

function fmtCount(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}

function queueBadgeStatus(count: number | null | undefined): string | undefined {
  if (count == null) return "neutral";
  if (count > 0) return "pending";
  return "success";
}

function moduleBridgeLabel(availability: AdminModuleAvailability): string {
  if (availability.available && availability.status === "healthy") return "Connected";
  // Purchase orders and inventory are Supabase-backed native modules — never "bridge".
  if (availability.reason === "setup_required") return "Requires database";
  if (availability.reason === "production_blocking") return "Requires database";
  if (availability.reason === "degraded") return "Degraded";
  return "Unavailable";
}

function moduleBridgeStatus(availability: AdminModuleAvailability): string {
  if (availability.available && availability.status === "healthy") return "success";
  if (availability.reason === "setup_required") return "warning";
  if (availability.reason === "production_blocking") return "error";
  return "neutral";
}

function QuickActionLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded-md border border-admin-border bg-admin-surface px-3 py-1.5 text-sm font-medium text-admin-secondary transition-colors hover:bg-admin-surface-muted hover:text-admin-primary",
        adminFocusRing(),
      )}
    >
      {children}
    </Link>
  );
}

function SystemPulseRow({ health, snap }: { health: AdminHealthSummary; snap: Awaited<ReturnType<typeof fetchAdminHomeSnapshot>> }) {
  const shell = getAdminHealthShellDisplay(health);
  // Order fulfillment actions are gated by the canonical availability policy and
  // fail closed. The reason is always shown, regardless of legacy Express env presence.
  const fulfillmentActionsAvailable = isOrderFulfillmentAvailable();
  const catalogos = health.integrations.find((i) => i.id === "catalogos");
  const importKey = health.integrations.find((i) => i.id === "import_internal_key");
  const catalogImportReady = Boolean(catalogos?.configured && importKey?.configured);
  const catalogImportPartial = Boolean(catalogos?.configured || importKey?.configured) && !catalogImportReady;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Link
        href="/admin/settings#health"
        className={cn(adminCardSurface, "flex flex-col p-3 transition-colors hover:bg-admin-surface-muted", adminFocusRing())}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Admin health</span>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge
            status={
              shell.pillTone === "success" ? "success" : shell.pillTone === "critical" ? "error" : "warning"
            }
            dot
          />
          <span className="text-sm font-medium text-admin-primary">{shell.pillLabel}</span>
        </div>
        <span className="mt-2 text-xs text-admin-muted">View integration status →</span>
      </Link>

      <div className={cn(adminCardSurface, "p-3")}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Environment</span>
        <p className="mt-2 text-sm font-medium capitalize text-admin-primary">{health.deployEnv}</p>
        <p className="mt-1 text-xs text-admin-muted">
          {snap.configured ? "Database reads available" : "Database not configured"}
        </p>
      </div>

      <div className={cn(adminCardSurface, "p-3")}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">
          Order fulfillment actions
        </span>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={fulfillmentActionsAvailable ? "success" : "warning"} dot />
          <span className="text-sm font-medium text-admin-primary">
            {fulfillmentActionsAvailable ? "Available" : "Unavailable"}
          </span>
        </div>
        <p className="mt-1 text-xs text-admin-muted">
          ship/status, invoice payment, create PO
          {!fulfillmentActionsAvailable ? " — disabled pending native migration" : ""}
        </p>
      </div>

      <div className={cn(adminCardSurface, "p-3")}>
        <span className="text-[10px] font-semibold uppercase tracking-wide text-admin-muted">Catalog import</span>
        <div className="mt-2 flex items-center gap-2">
          <StatusBadge status={catalogImportReady ? "success" : catalogImportPartial ? "neutral" : "neutral"} dot />
          <span className="text-sm font-medium text-admin-primary">
            {catalogImportReady ? "Ready" : catalogImportPartial ? "Partial" : "Not configured"}
          </span>
        </div>
        <p className="mt-1 text-xs text-admin-muted">
          {catalogImportReady
            ? "Catalog import & sync available."
            : catalogImportPartial
              ? "Optional — catalog sync or import credentials are only partially configured."
              : "Optional — URL import & catalog sync not set up. Storefront and catalog reads are unaffected."}
        </p>
      </div>
    </div>
  );
}

function FulfillmentModuleRow({
  health,
  ordersCount,
}: {
  health: AdminHealthSummary;
  ordersCount: number | null;
}) {
  const modules = [
    { id: "orders" as const, label: "Order records", href: "/admin/orders", detail: fmtCount(ordersCount) },
    {
      id: "purchase-orders" as const,
      label: "Purchase orders",
      href: "/admin/purchase-orders",
      detail: moduleBridgeLabel(getAdminModuleAvailability(health, "purchase-orders")),
    },
    {
      id: "inventory" as const,
      label: "Inventory",
      href: "/admin/inventory",
      detail: moduleBridgeLabel(getAdminModuleAvailability(health, "inventory")),
    },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {modules.map((mod) => {
        const availability = getAdminModuleAvailability(health, mod.id);
        return (
          <Link
            key={mod.id}
            href={mod.href}
            className={cn(
              adminCardSurface,
              "flex items-center justify-between p-3 transition-colors hover:bg-admin-surface-muted",
              adminFocusRing(),
            )}
          >
            <div>
              <p className="text-sm font-medium text-admin-primary">{mod.label}</p>
              <p className="mt-0.5 text-xs text-admin-muted">{mod.detail}</p>
            </div>
            <StatusBadge status={mod.id === "orders" ? "info" : moduleBridgeStatus(availability)} />
          </Link>
        );
      })}
    </div>
  );
}

export default async function AdminDashboardPage() {
  const [snap, health] = await Promise.all([fetchAdminHomeSnapshot(), Promise.resolve(resolveAdminHealth())]);

  const drafts = snap.draftProductCount ?? snap.catalog.buckets.find((b) => b.key === "drafts")?.count ?? null;
  const missingImages = snap.catalog.buckets.find((b) => b.key === "missing_images")?.count ?? null;
  const pendingReviews = snap.catalog.buckets.find((b) => b.key === "pending_match_reviews")?.count ?? null;
  const { tierMix } = snap;

  const usersAvailability = getAdminModuleAvailability(health, "users");
  const netTermsAvailability = getAdminModuleAvailability(health, "net-terms");
  const hasHealthIssues = health.issues.length > 0;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Command center"
        description="Monitor quote demand, catalog readiness, sourcing queues, and fulfillment health from one workspace."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <QuickActionLink href="/admin/leads">Quote requests</QuickActionLink>
            <QuickActionLink href="/admin/opportunities">Sourcing threads</QuickActionLink>
            <QuickActionLink href="/admin/products">Products</QuickActionLink>
            <QuickActionLink href="/admin/companies">Customers</QuickActionLink>
            {hasHealthIssues ? (
              <QuickActionLink href="/admin/settings#health">Admin health</QuickActionLink>
            ) : null}
          </div>
        }
      />

      {hasHealthIssues ? <AdminHealthBanner issues={health.issues} scope="shell" /> : null}

      {!snap.configured ? (
        <EmptyState
          title="Dashboard data unavailable"
          description="Database credentials are not configured. Review Admin Health to restore operator metrics."
          action={
            <Link href="/admin/settings#health" className="text-sm font-medium text-admin-accent hover:underline">
              Open Admin Health →
            </Link>
          }
        />
      ) : null}

      <PageSection title="System pulse" description="Integration and environment signals — no synthetic KPIs.">
        <SystemPulseRow health={health} snap={snap} />
      </PageSection>

      <PageSection
        title="Priority queues"
        description="Actionable work — review inbound demand and catalog gaps before maintenance tasks."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
          <AdminQueueCard
            title="Quote requests"
            description="Inbound catalogos.quote_requests awaiting operator review."
            value={fmtCount(snap.quoteRequestCount)}
            href="/admin/leads"
            badgeStatus={queueBadgeStatus(snap.quoteRequestCount)}
            needsAttention={snap.quoteRequestCount != null && snap.quoteRequestCount > 0}
          />
          <AdminQueueCard
            title="Sourcing threads"
            description="Active procurement_opportunities — buyer-linked sourcing conversations."
            value={fmtCount(snap.opportunityCount)}
            href="/admin/opportunities"
            badgeStatus={queueBadgeStatus(snap.opportunityCount)}
            needsAttention={snap.opportunityCount != null && snap.opportunityCount > 0}
          />
          <AdminQueueCard
            title="Company-linked quotes"
            description="Quote requests tied to a gc_company_id — procurement review candidates."
            value={fmtCount(snap.quoteRequestsLinkedCount)}
            href="/admin/procurement"
            badgeStatus={queueBadgeStatus(snap.quoteRequestsLinkedCount)}
            needsAttention={snap.quoteRequestsLinkedCount != null && snap.quoteRequestsLinkedCount > 0}
          />
          <AdminQueueCard
            title="Draft products"
            description="catalog_v2 drafts not yet published to the storefront."
            value={fmtCount(drafts)}
            href="/admin/products?status=draft"
            badgeStatus={queueBadgeStatus(drafts)}
            needsAttention={drafts != null && drafts > 0}
          />
          <AdminQueueCard
            title="Match reviews"
            description="Catalog items pending operator match review."
            value={fmtCount(pendingReviews)}
            href="/admin/products?tab=needs-review"
            badgeStatus={queueBadgeStatus(pendingReviews)}
            needsAttention={pendingReviews != null && pendingReviews > 0}
          />
        </div>
      </PageSection>

      <PageSection
        title="Recent quote requests"
        description="Latest catalogos.quote_requests — operator review label and buyer-visible status."
        actions={
          <Link href="/admin/leads" className="text-sm font-medium text-admin-accent hover:underline">
            Full queue →
          </Link>
        }
      >
        {snap.recentQuoteRequests.length === 0 ? (
          <EmptyState
            title="No quote requests yet"
            description="When buyers submit quote requests they will appear here for operator review."
            action={
              <Link href="/admin/leads" className="text-sm font-medium text-admin-accent hover:underline">
                Open quote request queue →
              </Link>
            }
          />
        ) : (
          <AdminRecentQuotesTable quotes={snap.recentQuoteRequests} />
        )}
      </PageSection>

      <PageSection title="Sourcing pulse" description="Procurement signals from live snapshot counts — no automated estimates.">
        <div className="grid gap-4 md:grid-cols-3">
          <StatCard
            label="Sourcing threads"
            value={fmtCount(snap.opportunityCount)}
            color="blue"
            accentBorder
            href="/admin/opportunities"
          />
          <StatCard
            label="Company-linked quotes"
            value={fmtCount(snap.quoteRequestsLinkedCount)}
            color="blue"
            accentBorder
            href="/admin/procurement"
          />
          <StatCard
            label="Procurement signals"
            value={
              snap.opportunityCount != null && snap.quoteRequestsLinkedCount != null
                ? (snap.opportunityCount + snap.quoteRequestsLinkedCount).toLocaleString()
                : "—"
            }
            color="default"
            accentBorder
            href="/admin/procurement"
          />
        </div>
        {snap.opportunityCount === 0 && snap.quoteRequestsLinkedCount === 0 ? (
          <p className="mt-3 text-sm text-admin-muted">No active sourcing signals yet.</p>
        ) : null}
      </PageSection>

      <PageSection
        title="Catalog readiness"
        description="Publishing and imagery health — secondary to procurement queues."
        actions={
          <div className="flex flex-wrap gap-3">
            <Link href="/admin/products" className="text-sm font-medium text-admin-accent hover:underline">
              Products →
            </Link>
            <Link href="/admin/products/import" className="text-sm font-medium text-admin-accent hover:underline">
              Import →
            </Link>
            <Link href="/admin/catalog" className="text-sm font-medium text-admin-accent hover:underline">
              Catalog health →
            </Link>
          </div>
        }
      >
        <StatGrid columns={3}>
          <StatCard label="Active products" value={fmtCount(snap.activeProductCount)} color="green" accentBorder href="/admin/products?status=active" />
          <StatCard label="Draft products" value={fmtCount(drafts)} color="amber" accentBorder href="/admin/products?status=draft" />
          <StatCard label="Active variants" value={fmtCount(snap.totalVariantActiveCount)} color="green" accentBorder href="/admin/products" />
        </StatGrid>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snap.catalog.buckets.slice(0, 6).map((b) => (
            <div key={b.key} className={cn(adminCardSurface, "px-4 py-3")}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-admin-secondary">{b.label}</span>
                <span className="font-mono text-xl font-semibold tabular-nums text-admin-primary">{fmtCount(b.count)}</span>
              </div>
            </div>
          ))}
        </div>
        {missingImages != null && missingImages > 0 ? (
          <p className="mt-3 text-xs text-admin-warning">
            {missingImages.toLocaleString()} catalog items missing imagery —{" "}
            <Link href="/admin/catalog" className="font-medium underline">
              review catalog health
            </Link>
          </p>
        ) : null}
      </PageSection>

      <PageSection title="Fulfillment snapshot" description="Order records from Supabase; bridge-gated modules show honest availability.">
        <StatGrid columns={3}>
          <StatCard
            label="Order records"
            value={fmtCount(snap.canonicalOrdersCount)}
            color="default"
            accentBorder
            href="/admin/orders"
          />
          <StatCard
            label="Purchase orders"
            value={getAdminModuleAvailability(health, "purchase-orders").available ? "Connected" : "Requires database"}
            color={getAdminModuleAvailability(health, "purchase-orders").available ? "green" : "amber"}
            accentBorder
            href="/admin/purchase-orders"
          />
          <StatCard
            label="Inventory"
            value={getAdminModuleAvailability(health, "inventory").available ? "Connected" : "Requires database"}
            color={getAdminModuleAvailability(health, "inventory").available ? "green" : "amber"}
            accentBorder
            href="/admin/inventory"
          />
        </StatGrid>
        <div className="mt-4">
          <FulfillmentModuleRow health={health} ordersCount={snap.canonicalOrdersCount} />
        </div>
      </PageSection>

      <PageSection title="Customers & accounts" description="Company directory and buyer membership — trusted counts exclude test/demo rows.">
        <div className="flex flex-wrap gap-3">
          <MetricChip label="Companies" value={fmtCount(snap.companiesCount)} />
          <MetricChip label="Buyer members" value={fmtCount(snap.companyMembersCount)} />
          <MetricChip label="Cub tier" value={tierMix.cub} />
          <MetricChip label="Grizzly tier" value={tierMix.grizzly} />
          <MetricChip label="Kodiak tier" value={tierMix.kodiak} />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <QuickActionLink href="/admin/companies">Companies</QuickActionLink>
          {usersAvailability.available ? (
            <QuickActionLink href="/admin/users">Users</QuickActionLink>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-admin-border px-3 py-1.5 text-sm text-admin-muted">
              Users <StatusBadge status="warning" />
            </span>
          )}
          {netTermsAvailability.available ? (
            <QuickActionLink href="/admin/net-terms">Net terms</QuickActionLink>
          ) : (
            <span className="inline-flex items-center gap-2 rounded-md border border-dashed border-admin-border px-3 py-1.5 text-sm text-admin-muted">
              Net terms <StatusBadge status="warning" />
            </span>
          )}
        </div>
        <div className="mt-4">
          <ContaminationExclusionNotice
            excludedTotal={snap.contamination.flaggedVisibleTotal}
            kpiExcludedTotal={snap.contamination.kpiExcludedTotal}
            partialScan={snap.contamination.partialScan}
          />
        </div>
      </PageSection>
    </div>
  );
}
