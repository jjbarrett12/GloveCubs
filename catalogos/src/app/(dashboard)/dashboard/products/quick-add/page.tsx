import { listSuppliers } from "@/lib/catalogos/suppliers";
import { getCategoriesForFilter } from "@/lib/review/data";
import { QuickAddPageClient } from "@/components/quick-add/QuickAddPageClient";

export default async function QuickAddPage() {
  const [suppliers, categories] = await Promise.all([listSuppliers(true), getCategoriesForFilter()]);
  return <QuickAddPageClient suppliers={suppliers} categories={categories} />;
}
