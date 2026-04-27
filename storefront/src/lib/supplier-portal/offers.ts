/**
 * Supplier Portal Offer Management
 * 
 * CRUD operations for supplier offers.
 * All operations are supplier_id scoped and audited.
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { logAuditEvent } from './auth';
import {
  buildSupplierOfferUpsertRow,
  parseSupplierOfferCostBasis,
} from '../../../../lib/supplier-offer-normalization';

async function mapCatalogProductNamesByIds(productIds: string[]): Promise<Map<string, string>> {
  const ids = Array.from(new Set(productIds.filter((x) => typeof x === 'string' && x.length > 0))).slice(0, 500);
  if (ids.length === 0) return new Map();
  const { data } = await getSupabaseCatalogos()
    .from('products')
    .select('id, name')
    .in('id', ids)
    .eq('is_active', true);
  const m = new Map<string, string>();
  for (const r of data ?? []) {
    if (r.id != null && r.name != null) m.set(String(r.id), String(r.name));
  }
  return m;
}

// ============================================================================
// TYPES
// ============================================================================

export interface SupplierOffer {
  id: string;
  supplier_id: string;
  product_id: string;
  product_name?: string;
  sku?: string;
  price: number;
  case_pack?: number;
  box_quantity?: number;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateOfferInput {
  product_id: string;
  sku?: string;
  price: number;
  case_pack?: number;
  box_quantity?: number;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
}

export interface UpdateOfferInput {
  price?: number;
  case_pack?: number;
  box_quantity?: number;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
  is_active?: boolean;
}

export interface BulkUploadResult {
  success: boolean;
  created: number;
  updated: number;
  errors: Array<{ row: number; error: string }>;
}

// ============================================================================
// LIST OFFERS
// ============================================================================

export async function listOffers(
  supplier_id: string,
  options: {
    active_only?: boolean;
    stale_only?: boolean;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ offers: SupplierOffer[]; total: number }> {
  let query = supabaseAdmin
    .from('supplier_offers')
    .select('*', { count: 'exact' })
    .eq('supplier_id', supplier_id);
    
  if (options.active_only) {
    query = query.eq('is_active', true);
  }
  
  if (options.stale_only) {
    const staleDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    query = query
      .eq('is_active', true)
      .lt('updated_at', staleDate.toISOString());
  }
  
  if (options.search) {
    query = query.or(`sku.ilike.%${options.search}%`);
  }
  
  query = query
    .order('updated_at', { ascending: false })
    .range(options.offset || 0, (options.offset || 0) + (options.limit || 50) - 1);
    
  const { data, count, error } = await query;
  
  if (error || !data) {
    return { offers: [], total: 0 };
  }

  const nameByProduct = await mapCatalogProductNamesByIds(
    data.map((d) => d.product_id as string).filter((x): x is string => typeof x === 'string')
  );

  return {
    offers: data.map(d => ({
      id: d.id,
      supplier_id: d.supplier_id,
      product_id: d.product_id,
      product_name: nameByProduct.get(String(d.product_id)),
      sku: d.sku as string,
      price: Number(d.price),
      case_pack: (d as { units_per_case?: number | null }).units_per_case ?? undefined,
      box_quantity: undefined,
      lead_time_days: d.lead_time_days as number | undefined,
      moq: undefined,
      shipping_notes: undefined,
      is_active: d.is_active,
      created_at: d.created_at,
      updated_at: d.updated_at,
    })),
    total: count || 0,
  };
}

// ============================================================================
// GET SINGLE OFFER
// ============================================================================

export async function getOffer(
  supplier_id: string,
  offer_id: string
): Promise<SupplierOffer | null> {
  const { data, error } = await supabaseAdmin
    .from('supplier_offers')
    .select('*')
    .eq('id', offer_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  if (error || !data) return null;

  const nameByProduct = await mapCatalogProductNamesByIds([String(data.product_id)]);

  return {
    id: data.id,
    supplier_id: data.supplier_id,
    product_id: data.product_id,
    product_name: nameByProduct.get(String(data.product_id)),
    sku: data.sku as string,
    price: Number(data.price),
    case_pack: (data as { units_per_case?: number | null }).units_per_case ?? undefined,
    box_quantity: undefined,
    lead_time_days: data.lead_time_days as number | undefined,
    moq: undefined,
    shipping_notes: undefined,
    is_active: data.is_active,
    created_at: data.created_at,
    updated_at: data.updated_at,
  };
}

// ============================================================================
// CREATE OFFER
// ============================================================================

export async function createOffer(
  supplier_id: string,
  user_id: string,
  input: CreateOfferInput,
  ipAddress?: string
): Promise<{ success: boolean; offer?: SupplierOffer; error?: string }> {
  // Validate product exists
  const { data: product } = await getSupabaseCatalogos()
    .from('products')
    .select('id, name')
    .eq('id', input.product_id)
    .eq('is_active', true)
    .single();
    
  if (!product) {
    return { success: false, error: 'Product not found' };
  }
  
  const catalogos = getSupabaseCatalogos();
  // Check for existing offer
  const { data: existing } = await catalogos
    .from('supplier_offers')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('product_id', input.product_id)
    .maybeSingle();
    
  if (existing) {
    return { success: false, error: 'Offer already exists for this product. Use update instead.' };
  }

  const costNum = Number(input.price);
  const supplierSku =
    input.sku != null && String(input.sku).trim().length > 0
      ? String(input.sku).trim()
      : `PORTAL-${input.product_id.slice(0, 8)}-${Date.now().toString(36)}`;
  const unitsPerCase =
    input.case_pack != null && Number.isFinite(input.case_pack) && input.case_pack > 0
      ? Math.trunc(input.case_pack)
      : null;

  const insertRow = buildSupplierOfferUpsertRow(
    {
      supplier_id,
      product_id: input.product_id,
      supplier_sku: supplierSku,
      cost: costNum,
      sell_price: costNum,
      lead_time_days: input.lead_time_days ?? null,
      is_active: true,
      units_per_case: unitsPerCase,
    },
    { currency_code: 'USD', cost_basis: 'per_case', cost: costNum, units_per_case: unitsPerCase ?? undefined }
  );

  const { data: offer, error } = await catalogos.from('supplier_offers').insert(insertRow).select('*').single();
    
  if (error) {
    return { success: false, error: 'Failed to create offer' };
  }
  
  // Audit log
  await logAuditEvent(supplier_id, user_id, 'create_offer', 'supplier_offer', offer.id, {
    product_id: input.product_id,
    price: input.price,
    case_pack: input.case_pack,
  }, ipAddress);
  
  return {
    success: true,
    offer: {
      id: offer.id,
      supplier_id: offer.supplier_id,
      product_id: offer.product_id,
      product_name: product.name,
      sku: offer.supplier_sku as string,
      price: Number(offer.cost),
      case_pack: (offer as { units_per_case?: number | null }).units_per_case ?? undefined,
      box_quantity: undefined,
      lead_time_days: offer.lead_time_days as number | undefined,
      moq: undefined,
      shipping_notes: undefined,
      is_active: offer.is_active,
      created_at: offer.created_at,
      updated_at: offer.updated_at,
    },
  };
}

// ============================================================================
// UPDATE OFFER
// ============================================================================

export async function updateOffer(
  supplier_id: string,
  user_id: string,
  offer_id: string,
  input: UpdateOfferInput,
  ipAddress?: string
): Promise<{ success: boolean; offer?: SupplierOffer; error?: string }> {
  const catalogos = getSupabaseCatalogos();
  const { data: existing, error: exErr } = await catalogos
    .from('supplier_offers')
    .select('*')
    .eq('id', offer_id)
    .eq('supplier_id', supplier_id)
    .single();

  if (exErr || !existing) {
    return { success: false, error: 'Offer not found' };
  }

  const ex = existing as {
    cost: number;
    sell_price: number | null;
    units_per_case: number | null;
    currency_code: string;
    cost_basis: string;
    lead_time_days: number | null;
    is_active: boolean;
  };

  const changes: Record<string, { old: unknown; new: unknown }> = {};

  if (input.price !== undefined && Number(input.price) !== Number(ex.cost)) {
    changes.price = { old: Number(ex.cost), new: input.price };
  }
  if (input.case_pack !== undefined) {
    const oldPack = ex.units_per_case ?? undefined;
    if (input.case_pack !== oldPack) {
      changes.case_pack = { old: oldPack, new: input.case_pack };
    }
  }
  if (input.lead_time_days !== undefined && input.lead_time_days !== ex.lead_time_days) {
    changes.lead_time_days = { old: ex.lead_time_days, new: input.lead_time_days };
  }
  if (input.is_active !== undefined && input.is_active !== ex.is_active) {
    changes.is_active = { old: ex.is_active, new: input.is_active };
  }
  if (input.box_quantity !== undefined) {
    changes.box_quantity = { old: undefined, new: input.box_quantity };
  }
  if (input.moq !== undefined) {
    changes.moq = { old: undefined, new: input.moq };
  }
  if (input.shipping_notes !== undefined) {
    changes.shipping_notes = { old: undefined, new: input.shipping_notes };
  }

  if (Object.keys(changes).length === 0) {
    return { success: false, error: 'No changes to apply' };
  }

  const nextCost = input.price !== undefined ? Number(input.price) : Number(ex.cost);
  const nextSell =
    input.price !== undefined
      ? Number(input.price)
      : ex.sell_price != null
        ? Number(ex.sell_price)
        : nextCost;
  const nextUnits =
    input.case_pack !== undefined
      ? input.case_pack != null && input.case_pack > 0
        ? Math.trunc(input.case_pack)
        : null
      : ex.units_per_case;

  const base: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    cost: nextCost,
    sell_price: nextSell,
    units_per_case: nextUnits,
  };
  if (input.lead_time_days !== undefined) base.lead_time_days = input.lead_time_days;
  if (input.is_active !== undefined) base.is_active = input.is_active;

  const patch = buildSupplierOfferUpsertRow(base, {
    currency_code: String(ex.currency_code),
    cost_basis: parseSupplierOfferCostBasis(ex.cost_basis),
    cost: nextCost,
    units_per_case: nextUnits ?? undefined,
  });

  const { data: offer, error } = await catalogos
    .from('supplier_offers')
    .update(patch)
    .eq('id', offer_id)
    .select('*')
    .single();

  if (error) {
    return { success: false, error: 'Failed to update offer' };
  }

  const nameByProduct = await mapCatalogProductNamesByIds([String(offer.product_id)]);

  await logAuditEvent(supplier_id, user_id, 'update_offer', 'supplier_offer', offer_id, changes, ipAddress);

  return {
    success: true,
    offer: {
      id: offer.id,
      supplier_id: offer.supplier_id,
      product_id: offer.product_id,
      product_name: nameByProduct.get(String(offer.product_id)),
      sku: offer.supplier_sku as string,
      price: Number(offer.cost),
      case_pack: (offer as { units_per_case?: number | null }).units_per_case ?? undefined,
      box_quantity: undefined,
      lead_time_days: offer.lead_time_days as number | undefined,
      moq: undefined,
      shipping_notes: undefined,
      is_active: offer.is_active,
      created_at: offer.created_at,
      updated_at: offer.updated_at,
    },
  };
}

// ============================================================================
// BULK UPDATE PRICES
// ============================================================================

export async function bulkUpdatePrices(
  supplier_id: string,
  user_id: string,
  updates: Array<{ offer_id: string; price: number }>,
  ipAddress?: string
): Promise<{ success: boolean; updated: number; errors: Array<{ offer_id: string; error: string }> }> {
  let updated = 0;
  const errors: Array<{ offer_id: string; error: string }> = [];
  
  for (const update of updates) {
    const result = await updateOffer(
      supplier_id,
      user_id,
      update.offer_id,
      { price: update.price },
      ipAddress
    );
    
    if (result.success) {
      updated++;
    } else {
      errors.push({ offer_id: update.offer_id, error: result.error || 'Unknown error' });
    }
  }
  
  // Log bulk action
  await logAuditEvent(supplier_id, user_id, 'bulk_update_prices', 'supplier_offer', null, {
    attempted: updates.length,
    updated,
    errors: errors.length,
  }, ipAddress);
  
  return { success: errors.length === 0, updated, errors };
}

// ============================================================================
// DEACTIVATE OFFER
// ============================================================================

export async function deactivateOffer(
  supplier_id: string,
  user_id: string,
  offer_id: string,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await updateOffer(supplier_id, user_id, offer_id, { is_active: false }, ipAddress);
  return { success: result.success, error: result.error };
}

// ============================================================================
// REACTIVATE OFFER
// ============================================================================

export async function reactivateOffer(
  supplier_id: string,
  user_id: string,
  offer_id: string,
  ipAddress?: string
): Promise<{ success: boolean; error?: string }> {
  const result = await updateOffer(supplier_id, user_id, offer_id, { is_active: true }, ipAddress);
  return { success: result.success, error: result.error };
}

// ============================================================================
// BULK UPLOAD (CSV)
// ============================================================================

export interface BulkUploadRow {
  product_id?: string;
  sku?: string;
  price: number;
  case_pack?: number;
  box_quantity?: number;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
}

export async function bulkUploadOffers(
  supplier_id: string,
  user_id: string,
  rows: BulkUploadRow[],
  ipAddress?: string
): Promise<BulkUploadResult> {
  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; error: string }> = [];
  
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 1;
    
    // Validate
    if (!row.product_id && !row.sku) {
      errors.push({ row: rowNum, error: 'Must provide either product_id or sku' });
      continue;
    }
    
    if (!row.price || row.price <= 0) {
      errors.push({ row: rowNum, error: 'Invalid price' });
      continue;
    }
    
    // Find product
    let productId = row.product_id;
    if (!productId && row.sku) {
      const { data: product } = await getSupabaseCatalogos()
        .from('products')
        .select('id')
        .eq('sku', row.sku)
        .eq('is_active', true)
        .single();
        
      if (!product) {
        errors.push({ row: rowNum, error: `Product not found for SKU: ${row.sku}` });
        continue;
      }
      productId = product.id;
    }
    
    // Check for existing offer
    const { data: existing } = await getSupabaseCatalogos()
      .from('supplier_offers')
      .select('id')
      .eq('supplier_id', supplier_id)
      .eq('product_id', productId)
      .maybeSingle();
      
    if (existing) {
      // Update existing
      const result = await updateOffer(supplier_id, user_id, existing.id, {
        price: row.price,
        case_pack: row.case_pack,
        box_quantity: row.box_quantity,
        lead_time_days: row.lead_time_days,
        moq: row.moq,
        shipping_notes: row.shipping_notes,
        is_active: true,
      }, ipAddress);
      
      if (result.success) {
        updated++;
      } else {
        errors.push({ row: rowNum, error: result.error || 'Update failed' });
      }
    } else {
      // Create new
      const result = await createOffer(supplier_id, user_id, {
        product_id: productId!,
        sku: row.sku,
        price: row.price,
        case_pack: row.case_pack,
        box_quantity: row.box_quantity,
        lead_time_days: row.lead_time_days,
        moq: row.moq,
        shipping_notes: row.shipping_notes,
      }, ipAddress);
      
      if (result.success) {
        created++;
      } else {
        errors.push({ row: rowNum, error: result.error || 'Create failed' });
      }
    }
  }
  
  // Log bulk upload
  await logAuditEvent(supplier_id, user_id, 'bulk_upload', 'supplier_offer', null, {
    rows: rows.length,
    created,
    updated,
    errors: errors.length,
  }, ipAddress);
  
  return {
    success: errors.length === 0,
    created,
    updated,
    errors,
  };
}

// ============================================================================
// SEARCH PRODUCTS (FOR ADDING NEW OFFERS)
// ============================================================================

export async function searchProducts(
  search: string,
  supplier_id: string,
  limit: number = 20
): Promise<Array<{
  id: string;
  name: string;
  sku?: string;
  has_offer: boolean;
}>> {
  const { data: products } = await getSupabaseCatalogos()
    .from('products')
    .select('id, name, sku')
    .eq('is_active', true)
    .or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
    .limit(limit);
    
  if (!products) return [];
  
  // Check which have existing offers
  const { data: existingOffers } = await supabaseAdmin
    .from('supplier_offers')
    .select('product_id')
    .eq('supplier_id', supplier_id)
    .in('product_id', products.map(p => p.id));
    
  const existingProductIds = new Set(existingOffers?.map(o => o.product_id) || []);
  
  return products.map(p => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    has_offer: existingProductIds.has(p.id),
  }));
}
