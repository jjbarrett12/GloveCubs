"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser-client";

const NAV: { href: string; label: string }[] = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/imports", label: "Imports" },
  { href: "/admin/catalog", label: "Catalog health" },
  { href: "/admin/leads", label: "Quotes / Leads" },
  { href: "/admin/opportunities", label: "Opportunities" },
  { href: "/admin/procurement", label: "Procurement" },
  { href: "/admin/analytics", label: "Analytics" },
  { href: "/admin/settings", label: "Settings" },
];

type Props = {
  children: React.ReactNode;
  adminUserId: string;
  adminEmail: string | null;
  deployEnv: string;
};

export function AdminShell({ children, adminUserId, adminEmail, deployEnv }: Props) {
  const pathname = usePathname();
  const [signingOut, setSigningOut] = React.useState(false);

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

  return (
    <div className="flex min-h-screen bg-[#0c0c0c] text-white">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-white/10 bg-[#101010] md:flex">
        <div className="border-b border-white/10 px-4 py-4">
          <Link href="/admin" className="text-sm font-bold tracking-tight text-white">
            GloveCubs <span className="text-[#f06232]">Admin</span>
          </Link>
          <p className="mt-2 text-[11px] leading-snug text-white/45">Operator console</p>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-2 py-3">
          {NAV.map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={
                  active
                    ? "rounded-md bg-white/[0.08] px-3 py-2 text-sm font-medium text-white"
                    : "rounded-md px-3 py-2 text-sm text-white/70 hover:bg-white/[0.05] hover:text-white"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#121212] px-4 py-3 md:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-1 md:flex-row md:items-center md:gap-4">
            <span
              className="inline-flex max-w-full items-center rounded border border-white/10 bg-white/[0.04] px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-white/55"
              title="Deployment environment"
            >
              {deployEnv}
            </span>
            <span className="truncate text-xs text-white/50">
              Signed in as <span className="text-white/80">{identity}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/store" className="text-xs text-white/45 hover:text-white/80">
              View storefront
            </Link>
            <button
              type="button"
              disabled={signingOut}
              onClick={() => void onSignOut()}
              className="rounded-md border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-medium text-white hover:bg-white/[0.1] disabled:opacity-50"
            >
              {signingOut ? "Signing out…" : "Sign out"}
            </button>
          </div>
        </header>

        <div className="border-b border-white/10 bg-amber-500/[0.07] px-4 py-2 md:px-6">
          <p className="text-[11px] leading-snug text-amber-100/90">
            Internal use only. Access requires an active <code className="text-amber-50/90">admin_users</code> row.
            Catalog writes and ingestion run in CatalogOS.
          </p>
        </div>

        <main className="flex-1 overflow-x-auto px-4 py-6 md:px-8">{children}</main>

        <nav className="flex flex-wrap gap-2 border-t border-white/10 bg-[#101010] px-3 py-3 md:hidden">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={
                pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href))
                  ? "rounded bg-white/10 px-2 py-1 text-[11px] text-white"
                  : "rounded px-2 py-1 text-[11px] text-white/60"
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}
