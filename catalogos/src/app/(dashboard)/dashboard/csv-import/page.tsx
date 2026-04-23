import { getSuppliersForFilter } from "@/lib/review/data";
import { CsvImportClient } from "./CsvImportClient";

export default async function CsvImportPage() {
  let suppliers: Awaited<ReturnType<typeof getSuppliersForFilter>>;
  try {
    suppliers = await getSuppliersForFilter();
  } catch {
    suppliers = [];
  }
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold tracking-tight">AI CSV import</h1>
      <p className="text-sm text-muted-foreground">
        Upload a supplier CSV. The system will infer column mapping, then you can review and run the existing ingestion pipeline.
      </p>
      <CsvImportClient suppliers={suppliers} />
    </div>
  );
}
