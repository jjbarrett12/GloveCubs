/** Structured audit log for admin order mutations (Next BFF → Express). */

export type AdminOrderMutationAction =
  | "order_update"
  | "invoice_payment"
  | "create_po";

export function logAdminOrderMutation(params: {
  operatorId: string;
  operatorEmail: string | null;
  action: AdminOrderMutationAction;
  orderId: string;
  success: boolean;
  httpStatus?: number;
  error?: string;
  detail?: Record<string, unknown>;
}): void {
  console.info(
    "[admin-order-mutation]",
    JSON.stringify({
      ts: new Date().toISOString(),
      operator_id: params.operatorId,
      operator_email: params.operatorEmail,
      action: params.action,
      order_id: params.orderId,
      success: params.success,
      http_status: params.httpStatus ?? null,
      error: params.error ?? null,
      ...params.detail,
    }),
  );
}
