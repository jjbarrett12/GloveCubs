import { PageHeader, ErrorState } from "@/components/admin";
import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getAdminModuleAvailability, resolveAdminHealth } from "@/lib/admin/admin-health";
import {
  fetchAdminDropshipCatalog,
  fetchAdminIncomingPurchaseOrders,
  fetchAdminVariantStockHistory,
  fetchAdminWarehouseInventory,
} from "@/lib/admin/admin-variant-inventory";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { InventoryModuleClient, type InventoryTab } from "./InventoryModuleClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Inventory | GloveCubs admin",
  robots: { index: false, follow: false },
};

const VALID_TABS = new Set<InventoryTab>(["warehouse", "incoming", "dropship", "history"]);

function parseTab(raw: string | undefined): InventoryTab {
  if (raw && VALID_TABS.has(raw as InventoryTab)) return raw as InventoryTab;
  return "warehouse";
}

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams?: { tab?: string };
}) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Inventory" description="Sign in as an admin operator." />
      </div>
    );
  }

  const health = resolveAdminHealth();
  const availability = getAdminModuleAvailability(health, "inventory");
  const tab = parseTab(searchParams?.tab);

  return (
    <div>
      <PageHeader
        title="Inventory"
        description="Warehouse stock by SKU/variant. PO receiving is the normal inbound path; manual adjustments are for corrections only."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="inventory" reason={availability.reason} />
      ) : (
        <InventoryContent tab={tab} />
      )}
    </div>
  );
}

async function InventoryContent({ tab }: { tab: InventoryTab }) {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorState
        title="Could not load inventory"
        message="Database credentials are not configured. Review Admin Health for configuration status."
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const [warehouse, incoming, dropship, history] = await Promise.all([
    fetchAdminWarehouseInventory(supabase),
    fetchAdminIncomingPurchaseOrders(supabase),
    fetchAdminDropshipCatalog(supabase),
    fetchAdminVariantStockHistory(supabase),
  ]);

  const err = warehouse.error || incoming.error || dropship.error || history.error;
  if (err) {
    return <ErrorState title="Could not load inventory" message={err} />;
  }

  return (
    <InventoryModuleClient
      activeTab={tab}
      warehouseRows={warehouse.rows}
      incomingRows={incoming.rows}
      dropshipRows={dropship.rows}
      historyRows={history.rows}
    />
  );
}
