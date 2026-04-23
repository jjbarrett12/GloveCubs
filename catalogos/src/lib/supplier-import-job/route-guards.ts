/**
 * Shared auth + org checks for supplier import job HTTP handlers.
 */

import { NextResponse } from "next/server";
import {
  requireSupplierImportAuth,
  type CatalogosSupplierImportAuthContext,
} from "./catalogos-api-auth";
import { assertJobAccessibleInOrganization, assertSupplierInOrganization } from "./supplier-import-access";
import { getSupplierImportJob } from "./service";
import type { SupplierImportJobRow } from "./types";

export async function requireSupplierImportRequestContext(
  req: Request
): Promise<CatalogosSupplierImportAuthContext | NextResponse> {
  return requireSupplierImportAuth(req);
}

export async function loadJobForOrgScope(
  jobId: string,
  organizationId: string
): Promise<{ job: SupplierImportJobRow } | NextResponse> {
  const job = await getSupplierImportJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }
  const denied = await assertJobAccessibleInOrganization(job, organizationId);
  if (denied) return denied;
  return { job };
}
