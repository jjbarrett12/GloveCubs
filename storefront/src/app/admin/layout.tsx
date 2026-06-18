import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { resolveAdminAccess } from "@/lib/admin/get-admin-user";
import { resolveAdminHealth } from "@/lib/admin/admin-health";
import { AdminShell } from "./_components/AdminShell";
import { AdminThemeProvider } from "./_components/AdminThemeProvider";
import "./admin-theme.css";

export const dynamic = "force-dynamic";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  const access = await resolveAdminAccess();

  if (access.kind === "sign_in_required") {
    const h = await headers();
    const pathname = h.get("x-gc-pathname")?.trim() || "/admin";
    redirect(`/login?next=${encodeURIComponent(pathname)}`);
  }

  if (access.kind === "not_admin") {
    notFound();
  }

  const deployEnv =
    process.env.VERCEL_ENV?.trim() || (process.env.NODE_ENV === "production" ? "production" : "development");
  const health = resolveAdminHealth();

  return (
    <AdminThemeProvider>
      <AdminShell
        adminEmail={access.email}
        adminUserId={access.userId}
        deployEnv={deployEnv}
        health={{ status: health.status, severity: health.severity, issues: health.issues }}
      >
        {children}
      </AdminShell>
    </AdminThemeProvider>
  );
}
