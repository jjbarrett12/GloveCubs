import { NextRequest, NextResponse } from "next/server";
import { getAdminUser } from "@/lib/admin/get-admin-user";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { parseJsonBody, nonEmptyString } from "@/lib/admin/products-import-proxy";
import { promoteStagingToDraftProduct, type ProductWriteInput } from "@/lib/admin/product-write";
import { parseImportDraftFromExtracted } from "@/lib/admin/import-draft-mapper";
import { importDraftToProductWriteInput } from "@/lib/admin/import-draft-promote";
import { lookupSkuCollisions } from "@/lib/admin/sku-collision-lookup";
import { normalizeSkuCollisionQuery, skuCollisionSetsForReadiness } from "@/lib/admin/sku-collision-lookup";
import { detectSkuCollisionIssues } from "@/lib/admin/variant-sku-intelligence";
import {
  clipboardImportMetadataFromStagingExtracted,
  clipboardPromoteStatusOverrideError,
} from "@/lib/admin/clipboard-promote-guards";

export const dynamic = "force-dynamic";

async function linkStagingToDraftProduct(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  stagingId: string,
  productId: string
): Promise<void> {
  await (supabase as any)
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .update({
      review_status: "converted_to_draft",
      created_catalog_product_id: productId,
    })
    .eq("id", stagingId);
}

export async function POST(
  request: NextRequest,
  { params }: { params: { stagingId: string } }
) {
  const admin = await getAdminUser();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  const stagingId = params.stagingId?.trim();
  if (!stagingId) return NextResponse.json({ error: "stagingId required" }, { status: 400 });

  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;

  const statusOverrideError = clipboardPromoteStatusOverrideError(body);
  if (statusOverrideError) {
    return NextResponse.json({ error: statusOverrideError }, { status: 400 });
  }

  const categoryId = nonEmptyString(body.category_id, 80);
  if (!categoryId.ok) return NextResponse.json({ error: `category_id ${categoryId.reason}` }, { status: 400 });

  const supabase = getSupabaseAdmin() as any;
  const { data: categoryRow } = await supabase
    .schema("catalogos")
    .from("categories")
    .select("slug")
    .eq("id", categoryId.value)
    .maybeSingle();
  const categorySlug = typeof categoryRow?.slug === "string" ? categoryRow.slug : null;
  const { data: row, error } = await supabase
    .schema("catalog_v2")
    .from("admin_url_clipboard_staging")
    .select("id, review_status, product_page_url, image_url, extracted, created_catalog_product_id")
    .eq("id", stagingId)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Staging row not found." }, { status: 404 });
  }
  const st = row as {
    review_status: string;
    product_page_url: string;
    image_url: string | null;
    extracted: Record<string, unknown>;
  };
  if (st.review_status !== "needs_review") {
    return NextResponse.json({ error: "Staging row is not awaiting review." }, { status: 409 });
  }

  const stRow = row as { created_catalog_product_id?: string | null };
  if (stRow.created_catalog_product_id?.trim()) {
    return NextResponse.json({ productId: stRow.created_catalog_product_id.trim() }, { status: 200 });
  }

  const { data: existingFromStaging } = await supabase
    .schema("catalog_v2")
    .from("catalog_products")
    .select("id")
    .eq("metadata->>import_staging_id", stagingId)
    .maybeSingle();
  const recoveredProductId = (existingFromStaging as { id?: string } | null)?.id?.trim();
  if (recoveredProductId) {
    await linkStagingToDraftProduct(supabase, stagingId, recoveredProductId);
    return NextResponse.json({ productId: recoveredProductId }, { status: 200 });
  }

  const draft = parseImportDraftFromExtracted(st.extracted ?? {}, st.product_page_url);
  if (!draft) {
    return NextResponse.json({ error: "Staging row has no import draft to promote." }, { status: 400 });
  }

  const operatorVariants: ProductWriteInput["variants"] = [];
  if (Array.isArray(body.variants)) {
    for (const rv of body.variants) {
      if (!rv || typeof rv !== "object") continue;
      const o = rv as Record<string, unknown>;
      operatorVariants.push({
        sizeCode: typeof o.size_code === "string" ? o.size_code : "",
        variantSku: typeof o.variant_sku === "string" ? o.variant_sku : "",
        listPrice:
          typeof o.list_price === "string"
            ? o.list_price
            : typeof o.list_price === "number"
              ? String(o.list_price)
              : "",
        manufacturerSku: typeof o.manufacturer_sku === "string" ? o.manufacturer_sku : null,
      });
    }
  }

  const applySkuProposals = body.apply_sku_proposals !== false;

  const merged = importDraftToProductWriteInput(
    draft,
    {
      category_id: categoryId.value,
      category_slug: categorySlug ?? undefined,
      name: typeof body.name === "string" ? body.name : undefined,
      brand_name: typeof body.brand_name === "string" ? body.brand_name : undefined,
      material: typeof body.material === "string" ? body.material : undefined,
      color: typeof body.color === "string" ? body.color : undefined,
      mil_thickness: typeof body.mil_thickness === "string" ? body.mil_thickness : undefined,
      case_pack: typeof body.case_pack === "string" ? body.case_pack : undefined,
      description: typeof body.description === "string" ? body.description : undefined,
      primary_image_url: typeof body.primary_image_url === "string" ? body.primary_image_url : undefined,
      internal_sku: typeof body.internal_sku === "string" ? body.internal_sku : undefined,
      variants: operatorVariants.length > 0 ? operatorVariants : undefined,
    },
    { stagingImageUrl: st.image_url, applySkuProposals, overwriteSkus: body.overwrite_skus === true }
  );

  merged.status = "draft";
  merged.quoteOnly = true;
  merged.importMetadataExtras = clipboardImportMetadataFromStagingExtracted(st.extracted ?? {});

  const collisionQuery = normalizeSkuCollisionQuery({
    parentSku: merged.internalSku ?? undefined,
    variantSkus: merged.variants.map((v) => v.variantSku).filter(Boolean),
  });
  const collisionResult = await lookupSkuCollisions(collisionQuery);
  const collisionSets = skuCollisionSetsForReadiness(collisionResult);
  const withinProductSkus = merged.variants.map((v) => v.variantSku);
  const collisionIssues = detectSkuCollisionIssues({
    parentSku: merged.internalSku ?? null,
    variantSkus: withinProductSkus,
    existingParentSkus: collisionSets.existingParentSkus,
    existingVariantSkus: collisionSets.existingVariantSkus,
  });
  const blockingCollision = collisionIssues.find((i) => i.severity === "blocker");
  if (blockingCollision) {
    const existingProductId =
      collisionResult.parent?.productId ??
      collisionResult.variants.find((v) => v.productId)?.productId ??
      null;
    if (existingProductId) {
      const { data: existingProd } = await supabase
        .schema("catalog_v2")
        .from("catalog_products")
        .select("id, status")
        .eq("id", existingProductId)
        .maybeSingle();
      const existingStatus = (existingProd as { status?: string } | null)?.status;
      if (existingStatus === "draft" && body.open_existing_draft === true) {
        await linkStagingToDraftProduct(supabase, stagingId, existingProductId);
        return NextResponse.json({ productId: existingProductId }, { status: 200 });
      }
      if (existingStatus === "draft") {
        return NextResponse.json(
          {
            error: blockingCollision.label,
            existingProductId,
            existingProductStatus: existingStatus,
          },
          { status: 409 }
        );
      }
    }
    return NextResponse.json({ error: blockingCollision.label }, { status: 409 });
  }

  const res = await promoteStagingToDraftProduct(stagingId, merged, admin.id);
  if ("error" in res) {
    return NextResponse.json({ error: res.error }, { status: 400 });
  }
  return NextResponse.json({ productId: res.productId }, { status: 201 });
}
