import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { requireCustomerProcurementSession } from "@/lib/procurement/customer-procurement-session";

export const dynamic = "force-dynamic";

const nav = [
  { href: "/workspace/procurement", label: "Overview" },
  { href: "/workspace/procurement/opportunities", label: "Approved notes" },
  { href: "/workspace/procurement/alternates", label: "Approved alternates" },
  { href: "/workspace/procurement/reorder", label: "Reorder" },
  { href: "/workspace/procurement/spend", label: "Trusted spend" },
  { href: "/workspace/procurement/memory", label: "Supplier / product memory" },
  { href: "/workspace/procurement/timeline", label: "Activity" },
] as const;

export default async function CustomerProcurementLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) redirect("/");
  const supabase = getSupabaseAdmin() as any;
  const pathname = (await headers()).get("x-gc-pathname") || "";
  const skipGate = pathname.includes("/workspace/procurement/active-company");
  if (!skipGate) {
    await requireCustomerProcurementSession(supabase);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-8 border-b border-white/10 pb-6">
        <h1 className="text-lg font-semibold tracking-tight">Procurement workspace</h1>
        <p className="mt-1 text-sm text-white/60">
          Operator-approved procurement notes, trusted spend, and reorder context for your organization.
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
