/** Structured audit log for admin mutations via Next BFF → Express. */

export type AdminExpressMutationAction =
  | "order_update"
  | "invoice_payment"
  | "create_po"
  | "inventory_list"
  | "inventory_adjust"
  | "purchase_orders_list"
  | "purchase_order_send"
  | "purchase_order_receive"
  | "users_list"
  | "user_update"
  | "net_terms_list"
  | "net_terms_patch"
  | "contact_messages_list";

export function logAdminExpressMutation(params: {
  operatorId: string;
  operatorEmail: string | null;
  action: AdminExpressMutationAction;
  targetId: string;
  success: boolean;
  httpStatus?: number;
  error?: string;
  detail?: Record<string, unknown>;
}): void {
  console.info(
    "[admin-express-mutation]",
    JSON.stringify({
      ts: new Date().toISOString(),
      operator_id: params.operatorId,
      operator_email: params.operatorEmail,
      action: params.action,
      target_id: params.targetId,
      success: params.success,
      http_status: params.httpStatus ?? null,
      error: params.error ?? null,
      ...params.detail,
    }),
  );
}
