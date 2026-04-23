/**
 * GET /api/supplier-import/jobs?supplier_id=&limit=
 * Organization scope comes from X-Catalogos-Organization-Id only (query organization_id is rejected).
 */

import { NextResponse } from "next/server";
import { listSupplierImportJobsForOrganization, toPublicJob } from "@/lib/supplier-import-job/service";
import { requireSupplierImportAuth, isValidUuid } from "@/lib/supplier-import-job/catalogos-api-auth";
import { assertSupplierInOrganization } from "@/lib/supplier-import-job/supplier-import-access";

export async function GET(req: Request) {
  try {
    const auth = requireSupplierImportAuth(req);
    if (auth instanceof NextResponse) return auth;

    const { searchParams } = new URL(req.url);
    const rogueOrg = searchParams.get("organization_id");
    if (rogueOrg) {
      return NextResponse.json(
        {
          error: "Forbidden",
          detail: "Do not pass organization_id in query; use X-Catalogos-Organization-Id",
        },
        { status: 403 }
      );
    }

    const supplierIdRaw = searchParams.get("supplier_id");
    const supplierId =
      supplierIdRaw && isValidUuid(supplierIdRaw) ? supplierIdRaw : undefined;
    if (supplierIdRaw && !supplierId) {
      return NextResponse.json({ error: "Invalid supplier_id" }, { status: 400 });
    }

    if (supplierId) {
      const denied = await assertSupplierInOrganization(supplierId, auth.organizationId);
      if (denied) return denied;
    }

    const limitRaw = searchParams.get("limit");
    const limit = limitRaw ? Math.min(200, Math.max(1, parseInt(limitRaw, 10) || 50)) : 50;

    const rows = await listSupplierImportJobsForOrganization({
      organizationId: auth.organizationId,
      supplierId,
      limit,
    });

    return NextResponse.json({
      jobs: rows.map(toPublicJob),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "List jobs failed" },
      { status: 500 }
    );
  }
}
