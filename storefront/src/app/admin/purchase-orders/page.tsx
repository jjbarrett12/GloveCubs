import { PageHeader, PageSection, EmptyState, ErrorState } from "@/components/admin";

import { ModuleUnavailableState } from "@/components/admin/ModuleUnavailableState";

import { getAdminOperator } from "@/lib/admin/get-admin-user";

import {

  getAdminModuleAvailability,

  resolveAdminHealth,

  sanitizeExpressModuleRuntimeError,

} from "@/lib/admin/admin-health";

import { fetchAdminPurchaseOrdersFromExpress } from "@/lib/admin/admin-purchase-orders-express";

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

        description="Drop-ship POs from the transitional Express admin API. Send emails vendors; receive posts stock using PO line quantities."

      />



      {!availability.available ? (

        <ModuleUnavailableState moduleId="purchase-orders" reason={availability.reason} />

      ) : (

        <PurchaseOrdersContent operator={operator} />

      )}

    </div>

  );

}



async function PurchaseOrdersContent({

  operator,

}: {

  operator: { id: string; email: string | null };

}) {

  const { rows, error, status } = await fetchAdminPurchaseOrdersFromExpress(operator);



  if (error) {

    return (

      <ErrorState

        title="Could not load purchase orders"

        message={sanitizeExpressModuleRuntimeError(error, status)}

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


