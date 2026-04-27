import DashboardLayoutShell from "./DashboardLayoutShell";

export default function DashboardLayout({
  children,
}: { children: React.ReactNode }) {
  return <DashboardLayoutShell>{children}</DashboardLayoutShell>;
}
