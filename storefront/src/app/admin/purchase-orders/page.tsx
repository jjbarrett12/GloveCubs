import { PageHeader, PageSection, EmptyState, ErrorState } from "@/components/admin";
import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import { getAdminModuleAvailability, resolveAdminHealth } from "@/lib/admin/admin-health";
import { fetchAdminPurchaseOrders } from "@/lib/admin/admin-purchase-orders";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { PurchaseOrdersEmptyAction, PurchaseOrdersTable } from "./PurchaseOrdersTable";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Purchase orders | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminPurchaseOrdersPage() {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Purchase orders" description="Sign in as an admin operator." />
      </div>
    );
  }

  const health = resolveAdminHealth();
  const availability = getAdminModuleAvailability(health, "purchase-orders");

  return (
    <div>
      <PageHeader
        title="Purchase orders"
        description="Drop-ship POs from Supabase. Send vendor emails; receive posts stock using PO line quantities."
      />

      {!availability.available ? (
        <ModuleUnavailableState moduleId="purchase-orders" reason={availability.reason} />
      ) : (
        <PurchaseOrdersContent />
      )}
    </div>
  );
}

async function PurchaseOrdersContent() {
  if (!isSupabaseConfigured()) {
    return (
      <ErrorState
        title="Could not load purchase orders"
        message="Database credentials are not configured. Review Admin Health for configuration status."
      />
    );
  }

  const supabase = getSupabaseAdmin();
  const { rows, error, status } = await fetchAdminPurchaseOrders(supabase);

  if (error) {
    return (
      <ErrorState
        title="Could not load purchase orders"
        message={status >= 500 ? "This module could not be loaded. Try again in a moment." : error}
      />
    );
  }

  return (
    <PageSection title={`POs (${rows.length})`}>
      {rows.length === 0 ? (
        <EmptyState
          title="No purchase orders yet"
          description="Create a purchase order from an order record when you are ready to fulfill."
          action={<PurchaseOrdersEmptyAction />}
        />
      ) : (
        <PurchaseOrdersTable rows={rows} />
      )}
    </PageSection>
  );
}
