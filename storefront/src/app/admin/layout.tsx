/**
 * Admin Layout
 * 
 * Internal operations dashboard layout with navigation
 */

import Link from "next/link";
import { ReactNode, Suspense } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}

async function getNavCounts() {
  const supabase = await getSupabase();

  const [jobsResult, reviewResult, alertsResult] = await Promise.all([
    supabase.from("job_queue").select("status").in("status", ["pending", "running", "failed", "blocked"]),
    supabase.from("review_queue").select("status, priority").in("status", ["open", "in_review"]),
    supabase.from("procurement_alerts").select("severity, status").in("status", ["open", "acknowledged"]),
  ]);

  const jobs = jobsResult.data || [];
  const reviews = reviewResult.data || [];
  const alerts = alertsResult.data || [];

  const activeJobs = jobs.filter((j) => ["pending", "running"].includes(j.status)).length;
  const failedJobs = jobs.filter((j) => j.status === "failed").length;
  const criticalReviews = reviews.filter((r) => r.priority === "critical").length;
  const openReviews = reviews.length;
  const openAlerts = alerts.length;
  const criticalAlerts = alerts.filter((a) => a.severity === "critical" || a.severity === "high").length;

  return { activeJobs, failedJobs, criticalReviews, openReviews, openAlerts, criticalAlerts };
}

const NAV_ITEMS = [
  {
    href: "/admin/buyer",
    label: "Buyer",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
      </svg>
    ),
  },
  {
    href: "/admin/commercial",
    label: "Commercial",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    countKey: "alerts" as const,
  },
  {
    href: "/admin/products",
    label: "Products",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
      </svg>
    ),
  },
  {
    href: "/admin/ingestion",
    label: "Ingestion",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
    ),
  },
  {
    href: "/admin/jobs",
    label: "Jobs",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
    countKey: "jobs" as const,
  },
  {
    href: "/admin/runs",
    label: "Runs",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: "/admin/review",
    label: "Review",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    countKey: "reviews" as const,
  },
  {
    href: "/admin/audit-reports",
    label: "Audits",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    href: "/admin/agent-config",
    label: "Agents",
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
  },
];

async function Navigation() {
  const counts = await getNavCounts();

  return (
    <nav className="flex min-h-11 flex-nowrap items-center gap-1">
      {NAV_ITEMS.map((item) => {
        let count: number | undefined;
        let urgent = false;

        if (item.countKey === "jobs") {
          count = counts.activeJobs;
          urgent = counts.failedJobs > 0;
        } else if (item.countKey === "reviews") {
          count = counts.openReviews;
          urgent = counts.criticalReviews > 0;
        } else if (item.countKey === "alerts") {
          count = counts.openAlerts;
          urgent = counts.criticalAlerts > 0;
        }

        return (
          <NavLink key={item.href} href={item.href} icon={item.icon} count={count} urgent={urgent}>
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

function NavLink({
  href,
  children,
  icon,
  count,
  urgent,
}: {
  href: string;
  children: ReactNode;
  icon?: ReactNode;
  count?: number;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    >
      {icon && <span className="text-gray-400">{icon}</span>}
      <span>{children}</span>
      {count !== undefined && count > 0 && (
        <span
          className={`inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-medium rounded-full min-w-[1.25rem] ${
            urgent ? "bg-red-100 text-red-700" : "bg-gray-200 text-gray-700"
          }`}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-gray-50">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl min-w-0 px-4 sm:px-6 lg:px-8">
          <div className="flex min-h-12 flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-2">
            <div className="flex shrink-0 items-center gap-3">
              <Link href="/admin" className="inline-flex min-h-11 items-center gap-2">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-900">
                  <span className="text-xs font-bold text-white">GC</span>
                </div>
                <span className="hidden text-sm font-semibold text-gray-900 sm:inline">Operations</span>
              </Link>
            </div>

            <div className="min-w-0 flex-1 overflow-x-auto pb-0.5 [-webkit-overflow-scrolling:touch] sm:pb-0">
              <Suspense fallback={<NavSkeleton />}>
                <Navigation />
              </Suspense>
            </div>

            <div className="hidden shrink-0 items-center gap-3 md:flex">
              <span className="text-xs text-gray-400">Internal Admin</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}

function NavSkeleton() {
  return (
    <div className="flex min-h-11 flex-nowrap gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="h-11 w-20 shrink-0 animate-pulse rounded-md bg-gray-100" />
      ))}
    </div>
  );
}
