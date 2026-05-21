import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { parseJsonBody, nonEmptyString } from "@/lib/admin/products-import-proxy";
import { promoteUnifiedStagingVariant } from "@/lib/admin/unified-ingestion-promote";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { stagingVariantId: string } }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const stagingVariantId = params.stagingVariantId?.trim();
  if (!stagingVariantId) {
    return NextResponse.json({ error: "stagingVariantId required" }, { status: 400 });
  }

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const categoryId = nonEmptyString(body.category_id, 80);
  if (!categoryId.ok) {
    return NextResponse.json({ error: `category_id ${categoryId.reason}` }, { status: 400 });
  }

  const confirmAwaitingHuman =
    body.confirm_awaiting_human === true || body.confirmAwaitingHuman === true;

  const result = await promoteUnifiedStagingVariant(
    {
      stagingVariantId,
      categoryId: categoryId.value,
      confirmAwaitingHuman,
      name: typeof body.name === "string" ? body.name : undefined,
      brandName: typeof body.brand_name === "string" ? body.brand_name : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      primaryImageUrl:
        typeof body.primary_image_url === "string" ? body.primary_image_url : undefined,
    },
    admin.id
  );

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
  }

  return NextResponse.json(
    { productId: result.productId, variantId: result.variantId },
    { status: 201 }
  );
}
