/**
 * Ownership scope for invoice intake idempotency.
 * Replays must never cross company / user / anonymous-session boundaries.
 */

import type { InvoiceIntakeIdentity } from "@/lib/invoice/intake-types";

export type InvoiceIdempotencyScope =
  | `company:${string}`
  | `user:${string}`
  | `anon:${string}`
  | `ephemeral:${string}`;

/**
 * Build a stable ownership scope for the current caller.
 * Prefer company, then authenticated user, then anonymous session.
 * Callers without any stable identity get an ephemeral scope so a client-supplied
 * key cannot collide with another tenant (and cannot be replayed later).
 */
export function buildInvoiceIdempotencyScope(
  identity: Pick<InvoiceIntakeIdentity, "company_id" | "user_id" | "anonymous_session_id">,
  ephemeralFallbackId: string,
): InvoiceIdempotencyScope {
  const companyId = identity.company_id?.trim();
  if (companyId) return `company:${companyId}`;

  const userId = identity.user_id?.trim();
  if (userId) return `user:${userId}`;

  const anon = identity.anonymous_session_id?.trim();
  if (anon) return `anon:${anon}`;

  return `ephemeral:${ephemeralFallbackId}`;
}

/** True when an intake/opportunity row belongs to the caller's scope. */
export function invoiceIdempotencyScopeMatches(
  rowScope: string | null | undefined,
  callerScope: string,
): boolean {
  const left = String(rowScope ?? "").trim();
  const right = String(callerScope ?? "").trim();
  return left.length > 0 && left === right;
}
