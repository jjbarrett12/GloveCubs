/**
 * Organization + supplier scoping for supplier import jobs (application layer).
 */

import { NextResponse } from "next/server";
import { getSupabaseCatalogos } from "@/lib/db/client";
import type { SupplierImportJobRow } from "./types";
import { isValidUuid } from "./catalogos-api-auth";

const ALLOW_UNSCOPED_SUPPLIERS =
  process.env.CATALOGOS_ALLOW_UNSCOPED_SUPPLIER_IMPORT === "1" ||
  process.env.CATALOGOS_ALLOW_UNSCOPED_SUPPLIER_IMPORT === "true";

export async function getSupplierOrganizationId(
  supplierId: string
): Promise<{ organizationId: string | null; found: boolean }> {
  const supabase = getSupabaseCatalogos(true);
  const { data, error } = await supabase
    .from("suppliers")
    .select("organization_id")
    .eq("id", supplierId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { organizationId: null, found: false };
  const row = data as { organization_id?: string | null };
  return { organizationId: row.organization_id ?? null, found: true };
}

/**
 * Supplier must exist and either:
 * - organization_id equals orgId, or
 * - organization_id is null and CATALOGOS_ALLOW_UNSCOPED_SUPPLIER_IMPORT is enabled (dev only).
 */
export async function assertSupplierInOrganization(
  supplierId: string,
  orgId: string
): Promise<NextResponse | null> {
  if (!isValidUuid(supplierId)) {
    return NextResponse.json({ error: "Invalid supplier_id" }, { status: 400 });
  }
  const { organizationId, found } = await getSupplierOrganizationId(supplierId);
  if (!found) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
  if (organizationId == null) {
    if (!ALLOW_UNSCOPED_SUPPLIERS) {
      return NextResponse.json(
        {
          error: "Forbidden",
          detail:
            "Supplier has no organization_id; set it in catalogos.suppliers or enable CATALOGOS_ALLOW_UNSCOPED_SUPPLIER_IMPORT for dev",
        },
        { status: 403 }
      );
    }
    return null;
  }
  if (organizationId !== orgId) {
    return NextResponse.json(
      { error: "Forbidden", detail: "Supplier does not belong to this organization" },
      { status: 403 }
    );
  }
  return null;
}

/**
 * Job must belong to org: job.organization_id matches, or both null and supplier unscoped allowed,
 * or job.organization_id null but supplier.organization_id matches (legacy rows).
 */
export async function assertJobAccessibleInOrganization(
  job: SupplierImportJobRow,
  orgId: string
): Promise<NextResponse | null> {
  if (job.organization_id && job.organization_id === orgId) {
    return null;
  }
  if (job.organization_id && job.organization_id !== orgId) {
    return NextResponse.json(
      { error: "Forbidden", detail: "Import job belongs to another organization" },
      { status: 403 }
    );
  }

  const { organizationId: supplierOrg, found } = await getSupplierOrganizationId(job.supplier_id);
  if (!found) {
    return NextResponse.json({ error: "Supplier not found" }, { status: 404 });
  }
  if (supplierOrg === orgId) {
    return null;
  }
  if (supplierOrg == null && ALLOW_UNSCOPED_SUPPLIERS) {
    return null;
  }
  return NextResponse.json(
    { error: "Forbidden", detail: "Import job is not visible in this organization scope" },
    { status: 403 }
  );
}
