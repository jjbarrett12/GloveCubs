import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { ADMIN_PRODUCT_UUID_RE } from "@/lib/admin/product-operations";
import { removeClipboardStagingImports } from "@/lib/admin/clipboard-url-staging";
import { parseJsonBody } from "@/lib/admin/products-import-proxy";

export const dynamic = "force-dynamic";

/** Removes staged URL imports from active lists; optionally deletes linked draft products. */
export async function POST(request: NextRequest) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseJsonBody<{ staging_ids?: unknown; delete_linked_drafts?: unknown }>(request);
  if (!parsed.ok) return parsed.response;

  const raw = parsed.value.staging_ids;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "staging_ids must be an array" }, { status: 400 });
  }

  const stagingIds = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => ADMIN_PRODUCT_UUID_RE.test(id));

  if (stagingIds.length === 0) {
    return NextResponse.json({ error: "No valid staging ids provided." }, { status: 400 });
  }

  const res = await removeClipboardStagingImports(stagingIds, {
    deleteLinkedDrafts: parsed.value.delete_linked_drafts === true,
  });
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: res.status ?? 400 });
  }

  return NextResponse.json(res, { status: 200 });
}
