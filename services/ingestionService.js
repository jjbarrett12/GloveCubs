/**
 * Product ingestion service.
 * High-level API for batch product imports.
 */

const { processCSV, toSupabaseRaw, toSupabaseNormalized, exportForReview } = require('../lib/ingestion/pipeline');
const { validateAndScore } = require('../lib/ingestion/validator');

let supabase = null;

function setSupabase(client) {
  supabase = client;
}

function getSupabase() {
  if (!supabase) {
    const { getSupabaseAdmin } = require('./supabaseClient');
    supabase = getSupabaseAdmin();
  }
  return supabase;
}

async function createImportBatch(supplierId, metadata = {}) {
  const db = getSupabase();
  
  const { data, error } = await db
    .from('catalogos_import_batches')
    .insert({
      supplier_id: supplierId,
      status: 'processing',
      metadata: {
        ...metadata,
        started_at: new Date().toISOString(),
      },
    })
    .select('id')
    .single();
  
  if (error) throw error;
  return data.id;
}

async function updateBatchStatus(batchId, status, stats = {}) {
  const db = getSupabase();
  
  const { error } = await db
    .from('catalogos_import_batches')
    .update({
      status,
      metadata: {
        ...stats,
        completed_at: new Date().toISOString(),
      },
    })
    .eq('id', batchId);
  
  if (error) throw error;
}

async function importCSV(csvContent, supplierId, options = {}) {
  const {
    enableAI = true,
    dryRun = false,
    onProgress = null,
  } = options;
  
  const result = await processCSV(csvContent, { enableAI, onProgress });
  
  if (!result.success) {
    return { success: false, error: result.error };
  }
  
  for (let i = 0; i < result.products.length; i++) {
    const validation = validateAndScore(result.products[i]);
    result.products[i]._validation = validation;
    result.products[i]._flags = validation.flags;
  }
  
  if (dryRun) {
    return {
      success: true,
      dryRun: true,
      products: result.products,
      validation: result.validation,
      stats: result.stats,
    };
  }
  
  const batchId = await createImportBatch(supplierId, {
    filename: options.filename || 'import.csv',
    totalRows: result.stats.totalRows,
  });
  
  try {
    const db = getSupabase();
    
    const rawRecords = result.products.map(p => toSupabaseRaw(p, batchId, supplierId));
    
    const { data: insertedRaw, error: rawError } = await db
      .from('catalogos_raw_supplier_products')
      .insert(rawRecords)
      .select('id, external_id');
    
    if (rawError) throw rawError;
    
    const rawIdMap = new Map(insertedRaw.map(r => [r.external_id, r.id]));
    
    const normalizedRecords = result.products.map(p => {
      const rawId = rawIdMap.get(p.supplier_sku);
      return {
        ...toSupabaseNormalized(p, batchId, rawId, supplierId),
        review_flags: p._flags?.map(f => ({
          flag_type: f.type,
          attribute_key: f.attribute_key,
          message: f.message,
          severity: f.severity,
        })) || [],
      };
    });
    
    const { data: insertedNorm, error: normError } = await db
      .from('catalogos_staging_products')
      .insert(normalizedRecords)
      .select('id, status');
    
    if (normError) throw normError;
    
    const insertedStats = {
      raw: insertedRaw.length,
      normalized: insertedNorm.length,
      pending: insertedNorm.filter(r => r.status === 'pending').length,
      review_required: insertedNorm.filter(r => r.status === 'review_required').length,
    };
    
    await updateBatchStatus(batchId, 'completed', {
      ...result.stats,
      ...insertedStats,
    });
    
    return {
      success: true,
      batchId,
      products: result.products,
      validation: result.validation,
      stats: {
        ...result.stats,
        inserted: insertedStats,
      },
    };
  } catch (err) {
    await updateBatchStatus(batchId, 'failed', {
      error: err.message,
    });
    throw err;
  }
}

async function getStagingProducts(batchId, options = {}) {
  const { status, limit = 50, offset = 0 } = options;
  const db = getSupabase();
  
  let query = db
    .from('catalogos_staging_products')
    .select('*')
    .eq('batch_id', batchId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  
  if (status) {
    query = query.eq('status', status);
  }
  
  const { data, error, count } = await query;
  if (error) throw error;
  
  return { products: data, total: count };
}

async function approveStagingProduct(stagingId, masterProductId = null) {
  const db = getSupabase();
  
  const { data, error } = await db
    .from('catalogos_staging_products')
    .update({
      status: masterProductId ? 'merged' : 'approved',
      master_product_id: masterProductId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagingId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function rejectStagingProduct(stagingId, reason = null) {
  const db = getSupabase();
  
  const { data, error } = await db
    .from('catalogos_staging_products')
    .update({
      status: 'rejected',
      metadata: { rejection_reason: reason },
      updated_at: new Date().toISOString(),
    })
    .eq('id', stagingId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

async function publishApprovedProducts(batchId) {
  const db = getSupabase();
  
  const { data: approved, error: fetchError } = await db
    .from('catalogos_staging_products')
    .select('*')
    .eq('batch_id', batchId)
    .eq('status', 'approved');
  
  if (fetchError) throw fetchError;
  
  if (!approved || approved.length === 0) {
    return { published: 0 };
  }
  
  const masterProducts = approved.map(staged => ({
    sku: staged.normalized_data.internal_sku,
    name: staged.normalized_data.canonical_title,
    category: staged.attributes.category,
    attributes: staged.attributes,
  }));
  
  const { data: inserted, error: insertError } = await db
    .from('catalogos_master_products')
    .upsert(masterProducts, { onConflict: 'sku' })
    .select('id, sku');
  
  if (insertError) throw insertError;
  
  const skuToMasterId = new Map(inserted.map(m => [m.sku, m.id]));
  
  for (const staged of approved) {
    const masterId = skuToMasterId.get(staged.normalized_data.internal_sku);
    if (masterId) {
      await db
        .from('catalogos_staging_products')
        .update({
          status: 'published',
          master_product_id: masterId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', staged.id);
    }
  }
  
  return { published: inserted.length };
}

async function getImportBatches(supplierId = null, limit = 20) {
  const db = getSupabase();
  
  let query = db
    .from('catalogos_import_batches')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (supplierId) {
    query = query.eq('supplier_id', supplierId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  
  return data;
}

module.exports = {
  setSupabase,
  createImportBatch,
  updateBatchStatus,
  importCSV,
  getStagingProducts,
  approveStagingProduct,
  rejectStagingProduct,
  publishApprovedProducts,
  getImportBatches,
  exportForReview,
};
