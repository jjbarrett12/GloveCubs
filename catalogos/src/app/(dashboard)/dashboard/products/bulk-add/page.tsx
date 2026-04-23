import { listSuppliers } from "@/lib/catalogos/suppliers";
import { BulkAddPageClient } from "@/components/bulk-add/BulkAddPageClient";

export default async function BulkAddPage() {
  const suppliers = await listSuppliers(true);
  return <BulkAddPageClient suppliers={suppliers} />;
}
