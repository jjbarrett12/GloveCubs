/**
 * Server-only: map gc_commerce order_lines → quote cart fields (catalog_v2 product id).
 * No order writes. Historical prices are display-only, never returned as "current" pricing.
 */

import type { QuoteCartItem } from "@/lib/quote-cart/types";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LINES = 100;

export type ReorderLineStatus = "available" | "needs_review" | "unavailable" | "snapshot_only";

export type ReorderQuoteCartLine = Omit<QuoteCartItem, "quantity">;

export type ReorderAvailableLine = {
  status: "available";
  orderLineId: string;
  lineNumber: number;
  defaultQty: number;
  cart: ReorderQuoteCartLine;
  historicalUnitPriceMinor: number;
  historicalQuantity: number;
  historicalDescription: string;
};

export type ReorderBlockedLine = {
  status: Exclude<ReorderLineStatus, "available">;
  orderLineId: string;
  lineNumber: number;
  historicalUnitPriceMinor: number;
  historicalQuantity: number;
  historicalDescription: string;
  explanation: string;
};

export type ReorderQuotePayload = {
  sourceOrder: { id: string; orderNumber: string };
  availableLines: ReorderAvailableLine[];
  blockedLines: ReorderBlockedLine[];
  summary: {
    available: number;
    needs_review: number;
    unavailable: number;
    snapshot_only: number;
    blocked: number;
  };
};

type SellableRow = {
  id: string;
  catalog_product_id: string | null;
  sku: string;
  display_name: string;
  is_active: boolean;
};

type CatalogProductRow = {
  id: string;
  name: string;
  slug: string;
  brand_id: string | null;
  status: string;
};

type CatalogVariantRow = {
  id: string;
  catalog_product_id: string;
  variant_sku: string | null;
  size_code: string | null;
  is_active: boolean;
};

function parseUuid(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return UUID_RE.test(t) ? t : null;
}

function snapshotText(snap: Record<string, unknown>): string {
  const keys = ["product_name", "display_name", "name", "sku", "variant_sku"];
  const parts: string[] = [];
  for (const k of keys) {
    const v = snap[k];
    if (v != null && String(v).trim()) parts.push(String(v));
  }
  return parts.length ? parts.join(" · ") : "Historical line";
}

export async function buildReorderQuotePayload(
  supabase: any,
  companyId: string,
  orderId: string,
  opts?: { selectedLineIds?: string[] | null }
): Promise<{ payload: ReorderQuotePayload | null; error: string | null }> {
  if (!UUID_RE.test(orderId) || !UUID_RE.test(companyId)) {
    return { payload: null, error: "Invalid id" };
  }

  const { data: ord, error: oErr } = await supabase
    .schema("gc_commerce")
    .from("orders")
    .select("id, company_id, order_number")
    .eq("id", orderId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (oErr) return { payload: null, error: oErr.message };
  if (!ord) return { payload: null, error: null };

  const orderNumber = String((ord as { order_number: string }).order_number);
  const sourceOrder = { id: String((ord as { id: string }).id), orderNumber };

  const { data: linesRaw, error: lErr } = await supabase
    .schema("gc_commerce")
    .from("order_lines")
    .select("id, line_number, quantity, unit_price_minor, sellable_product_id, product_snapshot")
    .eq("order_id", orderId)
    .order("line_number", { ascending: true })
    .limit(500);

  if (lErr) return { payload: null, error: lErr.message };

  let lines = (linesRaw ?? []) as Record<string, unknown>[];
  const selected = opts?.selectedLineIds?.filter((x) => typeof x === "string" && UUID_RE.test(x));
  if (selected != null && selected.length > 0) {
    const set = new Set(selected);
    lines = lines.filter((r) => set.has(String(r.id)));
    if (lines.length === 0) {
      return { payload: null, error: "No matching lines for selection" };
    }
  }

  if (lines.length > MAX_LINES) {
    return { payload: null, error: `At most ${MAX_LINES} lines per reorder request` };
  }

  const sellableIds = Array.from(new Set(lines.map((r) => String(r.sellable_product_id))));

  const { data: sellablesRaw } = await supabase
    .schema("gc_commerce")
    .from("sellable_products")
    .select("id, catalog_product_id, sku, display_name, is_active")
    .in("id", sellableIds);

  const sellableById = new Map<string, SellableRow>();
  for (const s of sellablesRaw ?? []) {
    const row = s as SellableRow;
    sellableById.set(String(row.id), {
      id: String(row.id),
      catalog_product_id: row.catalog_product_id != null ? String(row.catalog_product_id) : null,
      sku: String(row.sku ?? ""),
      display_name: String(row.display_name ?? ""),
      is_active: Boolean(row.is_active),
    });
  }

  const catalogIds = new Set<string>();
  for (const sp of Array.from(sellableById.values())) {
    const pid = parseUuid(sp.catalog_product_id);
    if (pid) catalogIds.add(pid);
  }
  for (const r of lines) {
    const snap = r.product_snapshot && typeof r.product_snapshot === "object" ? (r.product_snapshot as Record<string, unknown>) : {};
    const hint = parseUuid(snap.catalog_v2_product_id) ?? parseUuid(snap.catalog_product_id);
    if (hint) catalogIds.add(hint);
  }

  const catalogIdList = Array.from(catalogIds);
  const productById = new Map<string, CatalogProductRow>();
  const brandNameById = new Map<string, string>();

  if (catalogIdList.length > 0) {
    const { data: prods } = await supabase
      .schema("catalog_v2")
      .from("catalog_products")
      .select("id, name, slug, brand_id, status")
      .in("id", catalogIdList.slice(0, 500));

    const brandIds = new Set<string>();
    for (const p of prods ?? []) {
      const row = p as CatalogProductRow;
      productById.set(String(row.id), {
        id: String(row.id),
        name: String(row.name ?? ""),
        slug: String(row.slug ?? ""),
        brand_id: row.brand_id != null ? String(row.brand_id) : null,
        status: String(row.status ?? ""),
      });
      if (row.brand_id) brandIds.add(String(row.brand_id));
    }

    if (brandIds.size > 0) {
      const { data: brands } = await supabase.schema("catalogos").from("brands").select("id, name").in("id", Array.from(brandIds));
      for (const b of brands ?? []) {
        brandNameById.set(String((b as { id: string }).id), String((b as { name: string }).name ?? ""));
      }
    }
  }

  let variantRows: CatalogVariantRow[] = [];
  if (catalogIdList.length > 0) {
    const { data: vars } = await supabase
      .schema("catalog_v2")
      .from("catalog_variants")
      .select("id, catalog_product_id, variant_sku, size_code, is_active")
      .in("catalog_product_id", catalogIdList.slice(0, 500))
      .eq("is_active", true);
    variantRows = (vars ?? []) as CatalogVariantRow[];
  }

  const variantsByProduct = new Map<string, CatalogVariantRow[]>();
  for (const v of variantRows) {
    const pid = String(v.catalog_product_id);
    if (!variantsByProduct.has(pid)) variantsByProduct.set(pid, []);
    variantsByProduct.get(pid)!.push(v);
  }

  const availableLines: ReorderAvailableLine[] = [];
  const blockedLines: ReorderBlockedLine[] = [];

  const pushBlocked = (b: ReorderBlockedLine) => {
    blockedLines.push(b);
  };

  for (const r of lines) {
    const orderLineId = String(r.id);
    const lineNumber = Number(r.line_number);
    const qty = Number(r.quantity);
    const unitMinor = Number(r.unit_price_minor ?? 0);
    const snap = r.product_snapshot && typeof r.product_snapshot === "object" ? (r.product_snapshot as Record<string, unknown>) : {};
    const historicalDescription = snapshotText(snap);

    if (!Number.isFinite(qty) || qty < 1 || qty > 99999 || !Number.isInteger(qty)) {
      pushBlocked({
        status: "unavailable",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Line quantity is not usable for a new quote request.",
      });
      continue;
    }

    const sellable = sellableById.get(String(r.sellable_product_id));

    if (!sellable) {
      pushBlocked({
        status: "snapshot_only",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Sellable product link is missing; cannot resolve a catalog product id safely.",
      });
      continue;
    }

    if (!sellable.is_active) {
      pushBlocked({
        status: "unavailable",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Sellable product is inactive.",
      });
      continue;
    }

    const catalogProductId = parseUuid(sellable.catalog_product_id);
    if (!catalogProductId) {
      pushBlocked({
        status: "unavailable",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Sellable product has no catalog_product_id.",
      });
      continue;
    }

    const snapProductId = parseUuid(snap.catalog_v2_product_id) ?? parseUuid(snap.catalog_product_id);
    if (snapProductId && snapProductId !== catalogProductId) {
      pushBlocked({
        status: "needs_review",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Historical snapshot product id does not match the current sellable catalog link.",
      });
      continue;
    }

    const product = productById.get(catalogProductId);
    if (!product || product.status !== "active") {
      pushBlocked({
        status: "unavailable",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: "Catalog product is missing or not active.",
      });
      continue;
    }

    const variants = variantsByProduct.get(catalogProductId) ?? [];

    const snapVariantId = parseUuid(snap.catalog_v2_variant_id);
    let chosen: CatalogVariantRow | null = null;
    let lineBlock: { status: ReorderBlockedLine["status"]; explanation: string } | null = null;

    if (snapVariantId) {
      const hit = variants.find((v) => v.id === snapVariantId);
      if (hit) chosen = hit;
      else {
        lineBlock = {
          status: "needs_review",
          explanation: "Snapshot variant id does not match an active variant for this catalog product.",
        };
      }
    }

    if (!chosen && !lineBlock) {
      const skuHint =
        (typeof snap.variant_sku === "string" && snap.variant_sku.trim()) ||
        (typeof snap.sku === "string" && snap.sku.trim()) ||
        sellable.sku.trim();
      if (skuHint) {
        const skuMatches = variants.filter((v) => (v.variant_sku || "").trim() === skuHint.trim());
        if (skuMatches.length === 1) chosen = skuMatches[0]!;
        else if (skuMatches.length > 1) {
          lineBlock = {
            status: "needs_review",
            explanation: "Multiple active variants share the same SKU hint; cannot pick one safely.",
          };
        }
      }
    }

    if (!chosen && !lineBlock) {
      if (variants.length === 1) chosen = variants[0]!;
      else if (variants.length === 0) {
        lineBlock = {
          status: "unavailable",
          explanation: "No active catalog variants for this product.",
        };
      } else {
        lineBlock = {
          status: "needs_review",
          explanation: "Multiple active variants exist; snapshot does not identify one uniquely.",
        };
      }
    }

    if (lineBlock || !chosen) {
      pushBlocked({
        status: lineBlock?.status ?? "needs_review",
        orderLineId,
        lineNumber,
        historicalUnitPriceMinor: unitMinor,
        historicalQuantity: qty,
        historicalDescription,
        explanation: lineBlock?.explanation ?? "Variant could not be resolved.",
      });
      continue;
    }

    const brandName = product.brand_id ? brandNameById.get(product.brand_id) ?? null : null;
    const lineNote =
      `Reorder from order ${orderNumber} line ${lineNumber} (historical unit ${unitMinor} minor — reference only, not current pricing).`.slice(
        0,
        2000
      );

    const cart: ReorderQuoteCartLine = {
      product_id: product.id,
      name: product.name,
      slug: product.slug,
      brandName,
      line_note: lineNote,
      catalog_variant_id: chosen ? chosen.id : null,
      variant_sku: chosen?.variant_sku?.trim() || null,
      size_code: chosen?.size_code?.trim() || null,
    };

    availableLines.push({
      status: "available",
      orderLineId,
      lineNumber,
      defaultQty: qty,
      cart,
      historicalUnitPriceMinor: unitMinor,
      historicalQuantity: qty,
      historicalDescription,
    });
  }

  const summary = {
    available: availableLines.length,
    needs_review: blockedLines.filter((b) => b.status === "needs_review").length,
    unavailable: blockedLines.filter((b) => b.status === "unavailable").length,
    snapshot_only: blockedLines.filter((b) => b.status === "snapshot_only").length,
    blocked: blockedLines.length,
  };

  return {
    payload: { sourceOrder, availableLines, blockedLines, summary },
    error: null,
  };
}
