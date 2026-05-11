export default function ProcurementNestedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold text-white">Procurement</h1>
        <p className="text-sm text-white/55">Internal operations — cross-company reads per existing server policies.</p>
      </div>
      {children}
    </div>
  );
}
