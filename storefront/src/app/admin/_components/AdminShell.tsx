"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";
import { AdminThemeToggle } from "@/app/admin/_components/AdminThemeToggle";
import type { AdminHealthIssue, AdminHealthSeverity, AdminHealthStatus } from "@/lib/admin/admin-health";
import { getAdminHealthShellDisplay, type AdminHealthShellTone } from "@/lib/admin/admin-health";
import { adminFocusRing } from "@/components/admin/admin-theme-utils";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_PROCUREMENT: NavItem[] = [
  {
    href: "/admin",
    label: "Dashboard",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: "/admin/leads",
    label: "Quote requests",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
      </svg>
    ),
  },
  {
    href: "/admin/opportunities",
    label: "Sourcing threads",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
      </svg>
    ),
  },
  {
    href: "/admin/procurement",
    label: "Procurement review",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
];

const NAV_FULFILLMENT: NavItem[] = [
  {
    href: "/admin/orders",
    label: "Order records",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z"
        />
      </svg>
    ),
  },
  {
    href: "/admin/purchase-orders",
    label: "Purchase orders",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a48.1 48.1 0 00-3.259-.523M20.25 14.25V18.75M3.75 9h15.75M3.75 9v-.375A2.625 2.625 0 016.375 6h11.25A2.625 2.625 0 0120.25 8.625V9M3.75 9v.375c0 .621.504 1.125 1.125 1.125h15.75c.621 0 1.125-.504 1.125-1.125V9"
        />
      </svg>
    ),
  },
  {
    href: "/admin/inventory",
    label: "Inventory",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z"
        />
      </svg>
    ),
  },
];

const NAV_CATALOG: NavItem[] = [
  {
    href: "/admin/products",
    label: "Products",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
];

const NAV_CUSTOMERS: NavItem[] = [
  {
    href: "/admin/companies",
    label: "Customers",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-9H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21"
        />
      </svg>
    ),
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.748-.5M4.5 15.75v-.106c0-1.113.285-2.16.786-3.07M4.5 15.75v.106A12.318 12.318 0 0012 18.75c2.331 0 4.512-.645 6.374-1.766M12 12.75a4.5 4.5 0 110-9 4.5 4.5 0 010 9z"
        />
      </svg>
    ),
  },
  {
    href: "/admin/net-terms",
    label: "Net terms",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
        />
      </svg>
    ),
  },
  {
    href: "/admin/messages",
    label: "Messages",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
        />
      </svg>
    ),
  },
];

const NAV_SYSTEM: NavItem[] = [
  {
    href: "/admin/analytics",
    label: "Activity",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function AdminNavSections(props: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      <NavBlock title="Procurement" items={NAV_PROCUREMENT} pathname={props.pathname} onNavigate={props.onNavigate} />
      <NavBlock title="Fulfillment" items={NAV_FULFILLMENT} pathname={props.pathname} onNavigate={props.onNavigate} />
      <NavBlock title="Catalog" items={NAV_CATALOG} pathname={props.pathname} onNavigate={props.onNavigate} />
      <NavBlock title="Customers" items={NAV_CUSTOMERS} pathname={props.pathname} onNavigate={props.onNavigate} />
      <NavBlock title="System" items={NAV_SYSTEM} pathname={props.pathname} onNavigate={props.onNavigate} />
    </>
  );
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  pathname,
  onNavigate,
}: {
  item: NavItem;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        adminFocusRing(),
        active
          ? "border-l-2 border-admin-accent bg-admin-accent-soft pl-[10px] text-admin-primary shadow-sm"
          : "border-l-2 border-transparent text-admin-secondary hover:bg-admin-surface-muted hover:text-admin-primary",
      )}
    >
      <span className={cn("shrink-0", active ? "text-admin-accent" : "text-admin-muted")}>{item.icon}</span>
      <span className="truncate">{item.label}</span>
    </Link>
  );
}

function NavBlock({
  title,
  items,
  pathname,
  onNavigate,
}: {
  title: string;
  items: NavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <div className="mt-6 first:mt-0">
      <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-admin-muted">{title}</p>
      <nav className="mt-2 flex flex-col gap-0.5" aria-label={title}>
        {items.map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} onNavigate={onNavigate} />
        ))}
      </nav>
    </div>
  );
}

type Props = {
  children: React.ReactNode;
  adminUserId: string;
  adminEmail: string | null;
  deployEnv: string;
  health: {
    status: AdminHealthStatus;
    severity: AdminHealthSeverity;
    issues: AdminHealthIssue[];
  };
};

function healthPillClasses(tone: AdminHealthShellTone): string {
  if (tone === "success") {
    return "border-admin-success/30 bg-[var(--admin-success-surface)] text-admin-success";
  }
  if (tone === "critical") {
    return "border-admin-danger/30 bg-[var(--admin-danger-surface)] text-admin-danger";
  }
  return "border-admin-warning/30 bg-[var(--admin-warning-surface)] text-admin-warning";
}

export function AdminShell({ children, adminUserId, adminEmail, deployEnv, health }: Props) {
  const pathname = usePathname() || "";
  const [signingOut, setSigningOut] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  React.useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  async function onSignOut() {
    setSigningOut(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.signOut();
    } catch {
      /* still navigate home */
    }
    window.location.assign("/");
  }

  const identity = adminEmail?.trim() || `User ${adminUserId.slice(0, 8)}…`;
  const envIsProd = deployEnv === "production";
  const healthDisplay = getAdminHealthShellDisplay(health);
  const topIssue = health.issues[0];

  const closeMobile = () => setMobileMenuOpen(false);

  const brandBlock = (
    <Link
      href="/admin"
      className={cn("flex items-center gap-3 rounded-lg px-2 py-2", adminFocusRing())}
      aria-label="GloveCubs admin home"
      onClick={closeMobile}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-admin-border bg-admin-surface shadow-sm ring-1 ring-admin-border-subtle">
        <Image
          src="/images/glovecubs-header-logo.png"
          alt=""
          width={747}
          height={99}
          priority
          unoptimized
          className="h-4 w-auto"
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight text-admin-primary">GloveCubs</span>
        <span className="block text-[11px] font-medium uppercase tracking-wide text-admin-muted">Operator</span>
      </span>
    </Link>
  );

  const envBadge = (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide",
        envIsProd
          ? "border border-admin-success/30 bg-[var(--admin-success-surface)] text-admin-success"
          : "border border-admin-border bg-admin-surface-muted text-admin-secondary",
      )}
      title="Deployment environment"
    >
      {deployEnv}
    </span>
  );

  return (
    <div className="flex min-h-screen bg-admin-canvas text-admin-primary">
      <aside className="hidden w-[240px] shrink-0 flex-col border-r border-admin-border bg-admin-canvas-raised lg:flex">
        <div className="flex h-14 items-center border-b border-admin-border-subtle px-3">{brandBlock}</div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <AdminNavSections pathname={pathname} />
        </div>
        <div className="border-t border-admin-border-subtle p-3">
          <p className="truncate px-1 text-xs text-admin-muted" title={identity}>
            {identity}
          </p>
          <div className="mt-2 flex flex-col gap-1.5">
            <Link
              href="/store"
              className={cn(
                "rounded-md px-2 py-1.5 text-center text-xs font-medium text-admin-secondary ring-1 ring-admin-border hover:bg-admin-surface-muted hover:text-admin-primary",
                adminFocusRing(),
              )}
            >
              View store
            </Link>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void onSignOut()}
              className={cn(
                "rounded-md bg-admin-accent px-2 py-1.5 text-center text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50",
                adminFocusRing(),
              )}
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-admin-border bg-admin-canvas-raised/95 backdrop-blur supports-[backdrop-filter]:bg-admin-canvas-raised/80">
          <div className="flex h-14 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-admin-border bg-admin-surface text-admin-secondary hover:bg-admin-surface-muted hover:text-admin-primary lg:hidden",
                  adminFocusRing(),
                )}
                aria-label="Open navigation"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                </svg>
              </button>
              <div className="min-w-0 lg:hidden">{brandBlock}</div>
              <div className="hidden sm:block">{envBadge}</div>
            </div>

            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <Link
                href="/admin/settings#health"
                className={cn(
                  "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold sm:inline-flex",
                  healthPillClasses(healthDisplay.pillTone),
                  adminFocusRing(),
                )}
                title="View Admin Health"
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    healthDisplay.pillTone === "success"
                      ? "bg-admin-success"
                      : healthDisplay.pillTone === "critical"
                        ? "bg-admin-danger"
                        : "bg-admin-warning",
                  )}
                  aria-hidden
                />
                {healthDisplay.pillLabel}
              </Link>
              <div className="hidden md:block">
                <AdminThemeToggle variant="compact" />
              </div>
              <span className="hidden max-w-[140px] truncate text-xs text-admin-muted lg:inline" title={identity}>
                {identity}
              </span>
              <Link
                href="/store"
                className={cn(
                  "hidden shrink-0 text-xs font-medium text-admin-secondary hover:text-admin-primary sm:inline",
                  adminFocusRing(),
                )}
              >
                Store
              </Link>
              <button
                type="button"
                disabled={signingOut}
                onClick={() => void onSignOut()}
                className={cn(
                  "hidden shrink-0 rounded-md border border-admin-border bg-admin-surface px-3 py-1.5 text-xs font-medium text-admin-primary shadow-sm hover:bg-admin-surface-muted disabled:opacity-50 md:inline",
                  adminFocusRing(),
                )}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          </div>

          {healthDisplay.showStrip && topIssue ? (
            <div className="border-t border-admin-border-subtle bg-admin-surface-muted px-4 py-2 sm:px-6 lg:px-8">
              <p className="text-xs leading-snug text-admin-secondary">
                <span className="font-medium text-admin-primary">{topIssue.title}</span>
                {health.issues.length > 1 ? ` · ${health.issues.length - 1} more` : null}.{" "}
                <Link href="/admin/settings#health" className="font-medium text-admin-accent underline-offset-2 hover:underline">
                  View Admin Health
                </Link>
              </p>
            </div>
          ) : null}
        </header>

        <div className="border-b border-admin-border-subtle bg-admin-surface-muted/50">
          <div className="mx-auto max-w-[1400px] px-4 py-2.5 sm:px-6 lg:px-10">
            <p className="text-xs leading-snug text-admin-secondary sm:text-sm">
              Signed-in operators only. Product edits follow your team&apos;s publishing rules.
            </p>
          </div>
        </div>

        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">{children}</main>
      </div>

      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button
            type="button"
            className="absolute inset-0 bg-black/50"
            aria-label="Close navigation"
            onClick={closeMobile}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(280px,88vw)] flex-col border-r border-admin-border bg-admin-canvas-raised shadow-xl">
            <div className="flex items-center justify-between border-b border-admin-border-subtle px-3 py-3">
              {brandBlock}
              <button
                type="button"
                onClick={closeMobile}
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-admin-border text-admin-secondary hover:bg-admin-surface-muted",
                  adminFocusRing(),
                )}
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="border-b border-admin-border-subtle px-3 py-2">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                {envBadge}
                <Link
                  href="/admin/settings#health"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    healthPillClasses(healthDisplay.pillTone),
                  )}
                >
                  {healthDisplay.pillLabel}
                </Link>
              </div>
              <AdminThemeToggle variant="compact" />
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-3">
              <AdminNavSections pathname={pathname} onNavigate={closeMobile} />
            </div>
            <div className="border-t border-admin-border-subtle p-3">
              <p className="truncate text-xs text-admin-muted">{identity}</p>
              <div className="mt-2 flex flex-col gap-1.5">
                <Link
                  href="/store"
                  onClick={closeMobile}
                  className={cn(
                    "rounded-md px-2 py-1.5 text-center text-xs font-medium text-admin-secondary ring-1 ring-admin-border hover:bg-admin-surface-muted",
                    adminFocusRing(),
                  )}
                >
                  View store
                </Link>
                <button
                  type="button"
                  disabled={signingOut}
                  onClick={() => void onSignOut()}
                  className={cn(
                    "rounded-md bg-admin-accent px-2 py-1.5 text-center text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50",
                    adminFocusRing(),
                  )}
                >
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
