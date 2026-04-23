export default function SupplierIntakeLayout({
  children,
}: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border px-4 py-3">
        <p className="text-sm font-medium text-muted-foreground">
          GloveCubs — Supplier onboarding
        </p>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">{children}</main>
    </div>
  );
}
