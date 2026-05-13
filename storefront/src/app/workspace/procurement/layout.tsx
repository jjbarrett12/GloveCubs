import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/workspace/procurement", label: "Home" },
  { href: "/workspace/procurement/opportunities", label: "Approvals" },
  { href: "/workspace/procurement/alternates", label: "Alternates" },
  { href: "/workspace/procurement/reorder", label: "Reorder" },
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
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-lg font-semibold tracking-tight text-white/90">Buyer workspace</h1>
        <p className="mt-1 text-sm text-white/60">
          Track approvals, alternates, verified spend, and reorder shortcuts for your organization.
        </p>
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
  );
}
