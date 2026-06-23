import { PageHeader, ErrorState } from "@/components/admin";
import { getAdminOperator } from "@/lib/admin/get-admin-user";
import {
  fetchAdminPurchaseOrderById,
  loadPoLineVariantCandidates,
  parsePoId,
  resolvePoLineVariants,
  summarizePoLineReceipt,
} from "@/lib/admin/admin-purchase-orders";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { PoReceiveForm } from "./PoReceiveForm";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Receive warehouse shipment | GloveCubs admin",
  robots: { index: false, follow: false },
};

export default async function AdminPoReceivePage({ params }: { params: { poId: string } }) {
  const operator = await getAdminOperator();
  if (!operator) {
    return (
      <div>
        <PageHeader title="Receive warehouse shipment" description="Sign in as an admin operator." />
      </div>
    );
  }

  const poId = parsePoId(params.poId);
  if (poId == null) return <ErrorState title="Invalid PO" message="Purchase order id is not valid." />;
  if (!isSupabaseConfigured()) return <ErrorState title="Database unavailable" message="Supabase is not configured." />;

  const supabase = getSupabaseAdmin();
  const { po, error, status } = await fetchAdminPurchaseOrderById(supabase, poId);
  if (error || !po) {
    return <ErrorState title="Could not load PO" message={status >= 500 ? "Try again." : error ?? "Not found"} />;
  }

  if (po.purchase_order_type !== "inbound_stock") {
    return (
      <ErrorState
        title="Not an inbound stock PO"
        message="Dropship fulfillment orders do not receive into GloveCubs warehouse inventory."
      />
    );
  }

  if (po.status === "received" || po.status === "cancelled") {
    return <ErrorState title="PO not receivable" message={`This PO is ${po.status}.`} />;
  }

  const productIds = (po.lines ?? [])
    .map((l) => l.canonical_product_id || l.product_id)
    .filter(Boolean)
    .map(String);
  const candidates = await loadPoLineVariantCandidates(supabase, productIds);
  const resolved = resolvePoLineVariants(po.lines ?? [], candidates);
  const summary = summarizePoLineReceipt(po);

  const lines = summary.map((s) => {
    const res = resolved.find((r) => r.line_index === s.line_index);
    return {
      ...s,
      receive_now: !s.needs_sku_assignment && s.quantity_remaining > 0 ? String(s.quantity_remaining) : "",
      damaged: "",
      bin_location: "",
      notes: "",
      candidate_variants: res?.candidate_variants ?? [],
      selected_variant_id: res?.auto_assignable_variant_id ?? s.catalog_variant_id ?? "",
    };
  });

  return (
    <div>
      <PageHeader
        title="Receive warehouse shipment"
        description="Post inbound stock in sellable case units. Assign exact SKU/variant before receiving multi-size products."
      />
      {lines.length === 0 ? (
        <ErrorState title="No lines" message="PO has no receivable lines." />
      ) : (
        <PoReceiveForm poId={poId} poNumber={po.po_number || `#${poId}`} lines={lines} />
      )}
    </div>
  );
}
