import { listSuppliers } from "@/lib/catalogos/suppliers";
import { listCatalogBrands } from "@/lib/new-product-family/persist";
import { NewFamilyWizardPageClient } from "@/components/new-product-family/NewFamilyWizardPageClient";

export default async function NewProductFamilyPage() {
  const [brands, suppliers] = await Promise.all([
    listCatalogBrands().catch(() => []),
    listSuppliers(true)
      .then((rows) => rows.map((row) => ({ id: row.id, name: row.name })))
      .catch(() => []),
  ]);
  return <NewFamilyWizardPageClient brands={brands} suppliers={suppliers} />;
}
