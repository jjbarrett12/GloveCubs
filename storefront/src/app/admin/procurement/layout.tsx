import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminUser } from "@/lib/admin/get-admin-user";

export default async function ProcurementLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminUser();
  if (!admin) notFound();
  return (
    <div className="min-h-screen bg-[hsl(var(--background))] p-6 text-white">
      <header className="mb-6 border-b border-white/10 pb-4">
        <h1 className="text-lg font-semibold">Procurement workspace</h1>
        <p className="text-sm text-white/60">Internal operations only — no customer visibility.</p>
        <nav className="mt-3 flex flex-wrap gap-3 text-sm">
          <Link className="text-sky-300 hover:underline" href="/admin/procurement">
            Overview
          </Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
