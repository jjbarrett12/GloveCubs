import { SupplierIntakeForm } from "./SupplierIntakeForm";

export default function SupplierIntakePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Become a supplier</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Submit your company and catalog information. We’ll review and get back to you.
        </p>
      </div>
      <SupplierIntakeForm />
    </div>
  );
}
