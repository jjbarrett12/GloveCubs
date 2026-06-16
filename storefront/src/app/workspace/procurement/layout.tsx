import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SiteHeaderLoader } from "@/components/home/SiteHeaderLoader";
import { SiteFooter } from "@/components/home/SiteFooter";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/workspace/procurement", label: "Home" },
  { href: "/workspace/procurement/opportunities", label: "Sourcing threads" },
  { href: "/workspace/procurement/alternates", label: "Alternates" },
  { href: "/workspace/procurement/reorder", label: "Repeat quotes" },
  { href: "/workspace/procurement/spend", label: "Spend history" },
  { href: "/workspace/procurement/memory", label: "Purchase history" },
  { href: "/workspace/procurement/timeline", label: "Activity" },
] as const;

export default async function CustomerProcurementLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/request-pricing");
  const supabase = getSupabaseAdmin() as any;
  const pathname = (await headers()).get("x-gc-pathname") || "";
  const skipGate = pathname.includes("/workspace/procurement/active-company");
  if (!skipGate) {
    await requireCustomerProcurementSession(supabase);
  }

  return (
    <div className="flex min-h-screen flex-col bg-[hsl(var(--background))] font-poppins">
      <SiteHeaderLoader />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <nav className="mb-4 text-xs text-white/45" aria-label="Breadcrumb">
          <Link href="/account" className="text-[#f06232] hover:underline">
            Account
          </Link>
          <span className="mx-1.5">/</span>
          <Link href="/workspace/procurement" className="text-[#f06232] hover:underline">
            Buyer workspace
          </Link>
        </nav>
        <header className="mb-8 border-b border-white/10 pb-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-white/90">Buyer workspace</h1>
              <p className="mt-1 text-sm text-white/60">
                Track sourcing threads, alternates, verified spend, and repeat-quote shortcuts for your organization.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <Link href="/account/quotes" className="rounded-lg border border-white/15 px-3 py-1.5 font-semibold text-white/85 hover:border-[#f06232]/40">
                Quote history
              </Link>
              <Link href="/quote-cart" className="rounded-lg bg-[#f06232] px-3 py-1.5 font-semibold text-white hover:bg-[#f06232]/90">
                Quote request
              </Link>
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {nav.map((n) => (
              <Link key={n.href} href={n.href} className="text-sky-400 hover:underline">
                {n.label}
              </Link>
            ))}
          </nav>
        </header>
        {children}
      </div>
      <SiteFooter />
    </div>
  );
}
