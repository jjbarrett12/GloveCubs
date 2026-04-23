/**
 * Supplier Portal Offer Management
 * 
 * CRUD operations for supplier offers.
 * All operations are supplier_id scoped and audited.
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { logAuditEvent } from './auth';

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
      sku: d.sku,
      price: Number(d.price),
      case_pack: d.case_pack,
      box_quantity: d.box_quantity,
      lead_time_days: d.lead_time_days,
      moq: d.moq,
      shipping_notes: d.shipping_notes,
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
    sku: data.sku,
    price: Number(data.price),
    case_pack: data.case_pack,
    box_quantity: data.box_quantity,
    lead_time_days: data.lead_time_days,
    moq: data.moq,
    shipping_notes: data.shipping_notes,
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
  
  // Check for existing offer
  const { data: existing } = await supabaseAdmin
    .from('supplier_offers')
    .select('id')
    .eq('supplier_id', supplier_id)
    .eq('product_id', input.product_id)
    .single();
    
  if (existing) {
    return { success: false, error: 'Offer already exists for this product. Use update instead.' };
  }
  
  // Create offer
  const { data: offer, error } = await supabaseAdmin
    .from('supplier_offers')
    .insert({
      supplier_id,
      product_id: input.product_id,
      sku: input.sku,
      price: input.price,
      case_pack: input.case_pack,
      box_quantity: input.box_quantity,
      lead_time_days: input.lead_time_days,
      moq: input.moq,
      shipping_notes: input.shipping_notes,
      is_active: true,
    })
    .select()
    .single();
    
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
      sku: offer.sku,
      price: Number(offer.price),
      case_pack: offer.case_pack,
      box_quantity: offer.box_quantity,
      lead_time_days: offer.lead_time_days,
      moq: offer.moq,
      shipping_notes: offer.shipping_notes,
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
  // Get existing offer
  const { data: existing } = await supabaseAdmin
    .from('supplier_offers')
    .select('*')
    .eq('id', offer_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  if (!existing) {
    return { success: false, error: 'Offer not found' };
  }
  
  // Build update object
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  
  if (input.price !== undefined && input.price !== existing.price) {
    updates.price = input.price;
    changes.price = { old: existing.price, new: input.price };
  }
  
  if (input.case_pack !== undefined && input.case_pack !== existing.case_pack) {
    updates.case_pack = input.case_pack;
    changes.case_pack = { old: existing.case_pack, new: input.case_pack };
  }
  
  if (input.box_quantity !== undefined && input.box_quantity !== existing.box_quantity) {
    updates.box_quantity = input.box_quantity;
    changes.box_quantity = { old: existing.box_quantity, new: input.box_quantity };
  }
  
  if (input.lead_time_days !== undefined && input.lead_time_days !== existing.lead_time_days) {
    updates.lead_time_days = input.lead_time_days;
    changes.lead_time_days = { old: existing.lead_time_days, new: input.lead_time_days };
  }
  
  if (input.moq !== undefined && input.moq !== existing.moq) {
    updates.moq = input.moq;
    changes.moq = { old: existing.moq, new: input.moq };
  }
  
  if (input.shipping_notes !== undefined && input.shipping_notes !== existing.shipping_notes) {
    updates.shipping_notes = input.shipping_notes;
    changes.shipping_notes = { old: existing.shipping_notes, new: input.shipping_notes };
  }
  
  if (input.is_active !== undefined && input.is_active !== existing.is_active) {
    updates.is_active = input.is_active;
    changes.is_active = { old: existing.is_active, new: input.is_active };
  }
  
  if (Object.keys(changes).length === 0) {
    return { success: false, error: 'No changes to apply' };
  }
  
  // Apply update
  const { data: offer, error } = await supabaseAdmin
    .from('supplier_offers')
    .update(updates)
    .eq('id', offer_id)
    .select('*')
    .single();
    
  if (error) {
    return { success: false, error: 'Failed to update offer' };
  }

  const nameByProduct = await mapCatalogProductNamesByIds([String(offer.product_id)]);

  // Audit log
  await logAuditEvent(supplier_id, user_id, 'update_offer', 'supplier_offer', offer_id, changes, ipAddress);
  
  return {
    success: true,
    offer: {
      id: offer.id,
      supplier_id: offer.supplier_id,
      product_id: offer.product_id,
      product_name: nameByProduct.get(String(offer.product_id)),
      sku: offer.sku,
      price: Number(offer.price),
      case_pack: offer.case_pack,
      box_quantity: offer.box_quantity,
      lead_time_days: offer.lead_time_days,
      moq: offer.moq,
      shipping_notes: offer.shipping_notes,
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
    const { data: existing } = await supabaseAdmin
      .from('supplier_offers')
      .select('id')
      .eq('supplier_id', supplier_id)
      .eq('product_id', productId)
      .single();
      
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
