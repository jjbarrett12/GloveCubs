/**
 * Product Import Service
 * 
 * Orchestrates the product import workflow:
 * 1. Fetch URL safely
 * 2. Extract product data
 * 3. Run normalization
 * 4. Detect duplicates
 * 5. Create candidate or review item
 * 6. Persist with full audit trail
 */

import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { safeFetchHtml, validateUrl, type FetchResult } from './urlFetch';
import { extractProductFromHtml, type ExtractedProductData, type ExtractionResult } from './productExtraction';

// ============================================================================
// TYPES
// ============================================================================

export type CandidateStatus = 
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'auto_created'
  | 'merged';

export interface ProductCandidate {
  id: string;
  source_url: string;
  source_domain: string;
  status: CandidateStatus;
  
  // Extracted data
  extracted_data: ExtractedProductData;
  
  // Confidence and reasoning
  overall_confidence: number;
  field_confidence: Record<string, number>;
  extraction_reasoning: string;
  extraction_sources: string[];
  extraction_warnings: string[];
  
  // Duplicate detection
  potential_duplicates: Array<{
    canonical_product_id: string;
    product_name: string;
    similarity_score: number;
    match_reasons: string[];
  }>;
  duplicate_confidence: number;
  
  // Admin info
  created_by: string;
  created_at: string;
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  
  // Result
  created_product_id?: string;
  merged_into_product_id?: string;
}

export interface ImportResult {
  success: boolean;
  candidate_id?: string;
  status: CandidateStatus | 'fetch_failed' | 'extraction_failed' | 'validation_failed';
  candidate?: ProductCandidate;
  fetch_result?: FetchResult;
  extraction_result?: ExtractionResult;
  duplicates?: ProductCandidate['potential_duplicates'];
  error?: string;
}

export interface ApprovalResult {
  success: boolean;
  action: 'created' | 'merged' | 'rejected';
  product_id?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const IMPORT_CONFIG = {
  high_confidence_threshold: 0.8,
  duplicate_threshold: 0.7,
  auto_create_threshold: 0.95,
  required_fields: ['title'] as const,
};

// ============================================================================
// MAIN IMPORT FUNCTION
// ============================================================================

/**
 * Import a product from an external URL.
 */
export async function importProductFromUrl(
  url: string,
  adminUserId: string
): Promise<ImportResult> {
  // =========================================================================
  // 1. Validate URL
  // =========================================================================
  const urlValidation = validateUrl(url);
  if (!urlValidation.valid) {
    return {
      success: false,
      status: 'validation_failed',
      error: urlValidation.error,
    };
  }
  
  // =========================================================================
  // 2. Fetch HTML
  // =========================================================================
  const fetchResult = await safeFetchHtml(url);
  
  if (!fetchResult.success || !fetchResult.html) {
    return {
      success: false,
      status: 'fetch_failed',
      fetch_result: fetchResult,
      error: fetchResult.error,
    };
  }
  
  // =========================================================================
  // 3. Extract product data
  // =========================================================================
  const extractionResult = extractProductFromHtml(fetchResult.html, url);
  
  if (!extractionResult.success) {
    return {
      success: false,
      status: 'extraction_failed',
      fetch_result: fetchResult,
      extraction_result: extractionResult,
      error: 'Failed to extract product data from page',
    };
  }
  
  // Validate required fields
  const missingFields = IMPORT_CONFIG.required_fields.filter(
    field => !extractionResult.extracted[field]
  );
  
  if (missingFields.length > 0) {
    return {
      success: false,
      status: 'validation_failed',
      fetch_result: fetchResult,
      extraction_result: extractionResult,
      error: `Missing required fields: ${missingFields.join(', ')}`,
    };
  }
  
  // =========================================================================
  // 4. Detect duplicates
  // =========================================================================
  const duplicates = await findDuplicates(extractionResult.extracted);
  const highestDuplicateScore = duplicates.length > 0 
    ? Math.max(...duplicates.map(d => d.similarity_score))
    : 0;
  
  // =========================================================================
  // 5. Determine status
  // =========================================================================
  let status: CandidateStatus;
  
  if (highestDuplicateScore >= IMPORT_CONFIG.duplicate_threshold) {
    // High duplicate match - needs review
    status = 'pending_review';
  } else if (extractionResult.confidence.overall >= IMPORT_CONFIG.auto_create_threshold) {
    // Very high confidence with no duplicates - could auto-create
    // But for safety, still require review
    status = 'pending_review';
  } else {
    status = 'pending_review';
  }
  
  // =========================================================================
  // 6. Create candidate record
  // =========================================================================
  const sourceDomain = urlValidation.url?.hostname || '';
  
  const candidate: Omit<ProductCandidate, 'id'> = {
    source_url: fetchResult.final_url || url,
    source_domain: sourceDomain,
    status,
    extracted_data: extractionResult.extracted,
    overall_confidence: extractionResult.confidence.overall,
    field_confidence: extractionResult.confidence.field_scores,
    extraction_reasoning: extractionResult.reasoning.summary,
    extraction_sources: extractionResult.reasoning.sources,
    extraction_warnings: extractionResult.reasoning.warnings,
    potential_duplicates: duplicates,
    duplicate_confidence: highestDuplicateScore,
    created_by: adminUserId,
    created_at: new Date().toISOString(),
  };
  
  // Persist to database
  const { data: savedCandidate, error: saveError } = await supabaseAdmin
    .from('product_import_candidates')
    .insert({
      source_url: candidate.source_url,
      source_domain: candidate.source_domain,
      status: candidate.status,
      extracted_data: candidate.extracted_data,
      overall_confidence: candidate.overall_confidence,
      field_confidence: candidate.field_confidence,
      extraction_reasoning: candidate.extraction_reasoning,
      extraction_sources: candidate.extraction_sources,
      extraction_warnings: candidate.extraction_warnings,
      potential_duplicates: candidate.potential_duplicates,
      duplicate_confidence: candidate.duplicate_confidence,
      created_by: candidate.created_by,
    })
    .select()
    .single();
    
  if (saveError || !savedCandidate) {
    return {
      success: false,
      status: 'validation_failed',
      fetch_result: fetchResult,
      extraction_result: extractionResult,
      error: `Failed to save candidate: ${saveError?.message}`,
    };
  }
  
  return {
    success: true,
    candidate_id: savedCandidate.id,
    status,
    candidate: { ...candidate, id: savedCandidate.id } as ProductCandidate,
    fetch_result: fetchResult,
    extraction_result: extractionResult,
    duplicates,
  };
}

// ============================================================================
// DUPLICATE DETECTION
// ============================================================================

/**
 * Find potential duplicate products in the canonical catalog.
 */
async function findDuplicates(
  extracted: ExtractedProductData
): Promise<ProductCandidate['potential_duplicates']> {
  const duplicates: ProductCandidate['potential_duplicates'] = [];
  
  // =========================================================================
  // 1. Exact matches on identifiers
  // =========================================================================
  
  // UPC match
  if (extracted.upc) {
    const { data: upcMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name, attributes')
      .filter('attributes->>upc', 'eq', extracted.upc)
      .eq('is_active', true)
      .limit(5);
      
    if (upcMatches) {
      for (const match of upcMatches) {
        duplicates.push({
          canonical_product_id: match.id,
          product_name: match.name,
          similarity_score: 0.98,
          match_reasons: ['UPC exact match'],
        });
      }
    }
  }
  
  // MPN match
  if (extracted.mpn) {
    const { data: mpnMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name, attributes')
      .filter('attributes->>mpn', 'ilike', extracted.mpn)
      .eq('is_active', true)
      .limit(5);
      
    if (mpnMatches) {
      for (const match of mpnMatches) {
        const existing = duplicates.find(d => d.canonical_product_id === match.id);
        if (existing) {
          existing.match_reasons.push('MPN match');
          existing.similarity_score = Math.max(existing.similarity_score, 0.95);
        } else {
          duplicates.push({
            canonical_product_id: match.id,
            product_name: match.name,
            similarity_score: 0.95,
            match_reasons: ['MPN match'],
          });
        }
      }
    }
  }
  
  // SKU match
  if (extracted.sku || extracted.item_number) {
    const sku = extracted.sku || extracted.item_number;
    const { data: skuMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name, sku')
      .ilike('sku', sku!)
      .eq('is_active', true)
      .limit(5);
      
    if (skuMatches) {
      for (const match of skuMatches) {
        const existing = duplicates.find(d => d.canonical_product_id === match.id);
        if (existing) {
          existing.match_reasons.push('SKU match');
          existing.similarity_score = Math.max(existing.similarity_score, 0.9);
        } else {
          duplicates.push({
            canonical_product_id: match.id,
            product_name: match.name,
            similarity_score: 0.9,
            match_reasons: ['SKU match'],
          });
        }
      }
    }
  }
  
  // =========================================================================
  // 2. Fuzzy name matching
  // =========================================================================
  
  if (extracted.title) {
    // Search by name similarity
    const searchTerms = extracted.title.split(/\s+/).slice(0, 5).join(' ');
    
    const { data: nameMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name, attributes')
      .ilike('name', `%${searchTerms.substring(0, 30)}%`)
      .eq('is_active', true)
      .limit(10);
      
    if (nameMatches) {
      for (const match of nameMatches) {
        const matAttrs =
          match.attributes &&
          typeof match.attributes === 'object' &&
          !Array.isArray(match.attributes)
            ? (match.attributes as Record<string, unknown>)
            : {};
        const mMaterial = matAttrs.material as string | undefined;
        const mSize = matAttrs.size as string | undefined;
        const mPack = matAttrs.pack_size as number | string | undefined;

        // Calculate attribute-based similarity
        let score = 0;
        const reasons: string[] = [];
        
        // Name similarity
        const nameSimilarity = calculateNameSimilarity(extracted.title, match.name as string);
        if (nameSimilarity >= 0.5) {
          score += nameSimilarity * 0.4;
          reasons.push(`Name ${Math.round(nameSimilarity * 100)}% similar`);
        }
        
        // Material match
        if (extracted.material && mMaterial) {
          if (extracted.material.toLowerCase() === mMaterial.toLowerCase()) {
            score += 0.2;
            reasons.push('Material match');
          }
        }
        
        // Size match
        if (extracted.size && mSize) {
          if (extracted.size.toLowerCase() === mSize.toLowerCase()) {
            score += 0.2;
            reasons.push('Size match');
          }
        }
        
        // Pack size match
        if (extracted.pack_size != null && mPack != null) {
          if (Number(extracted.pack_size) === Number(mPack)) {
            score += 0.2;
            reasons.push('Pack size match');
          }
        }
        
        if (score >= 0.5 && reasons.length >= 2) {
          const existing = duplicates.find(d => d.canonical_product_id === match.id);
          if (existing) {
            existing.match_reasons.push(...reasons);
            existing.similarity_score = Math.max(existing.similarity_score, score);
          } else {
            duplicates.push({
              canonical_product_id: match.id,
              product_name: match.name,
              similarity_score: score,
              match_reasons: reasons,
            });
          }
        }
      }
    }
  }
  
  // Sort by similarity score
  duplicates.sort((a, b) => b.similarity_score - a.similarity_score);
  
  return duplicates.slice(0, 5);
}

function calculateNameSimilarity(a: string, b: string): number {
  const aTokens = new Set(a.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  const bTokens = new Set(b.toLowerCase().split(/\s+/).filter(t => t.length > 2));
  
  if (aTokens.size === 0 || bTokens.size === 0) return 0;
  
  let matches = 0;
  for (const token of Array.from(aTokens)) {
    if (bTokens.has(token)) matches++;
  }
  
  return matches / Math.max(aTokens.size, bTokens.size);
}

// ============================================================================
// APPROVAL WORKFLOW
// ============================================================================

/**
 * Approve a product candidate and create the canonical product.
 */
export async function approveCandidate(
  candidateId: string,
  adminUserId: string,
  options: {
    action: 'create' | 'merge';
    merge_into_product_id?: string;
    override_fields?: Partial<ExtractedProductData>;
    notes?: string;
  }
): Promise<ApprovalResult> {
  // Load candidate
  const { data: candidate, error: loadError } = await supabaseAdmin
    .from('product_import_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();
    
  if (loadError || !candidate) {
    return { success: false, action: 'rejected', error: 'Candidate not found' };
  }
  
  if (candidate.status !== 'pending_review') {
    return { success: false, action: 'rejected', error: 'Candidate already processed' };
  }
  
  const extractedData = candidate.extracted_data as ExtractedProductData;
  const finalData = { ...extractedData, ...options.override_fields };
  
  if (options.action === 'create') {
    return {
      success: false,
      action: 'created',
      error:
        'Creating catalog products from URL import is disabled. Use CatalogOS ingest and publish to write catalogos.products.',
    };
  } else if (options.action === 'merge' && options.merge_into_product_id) {
    // Merge into existing product (just link, don't modify existing)
    await supabaseAdmin
      .from('product_import_candidates')
      .update({
        status: 'merged',
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString(),
        review_notes: options.notes,
        merged_into_product_id: options.merge_into_product_id,
      })
      .eq('id', candidateId);
      
    return { success: true, action: 'merged', product_id: options.merge_into_product_id };
  }
  
  return { success: false, action: 'rejected', error: 'Invalid action' };
}

/**
 * Reject a product candidate.
 */
export async function rejectCandidate(
  candidateId: string,
  adminUserId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabaseAdmin
    .from('product_import_candidates')
    .update({
      status: 'rejected',
      reviewed_by: adminUserId,
      reviewed_at: new Date().toISOString(),
      review_notes: reason,
    })
    .eq('id', candidateId)
    .eq('status', 'pending_review');
    
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Get pending candidates for review.
 */
export async function getPendingCandidates(
  limit: number = 20,
  offset: number = 0
): Promise<{ candidates: ProductCandidate[]; total: number }> {
  const { data, error, count } = await supabaseAdmin
    .from('product_import_candidates')
    .select('*', { count: 'exact' })
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
    
  if (error) {
    return { candidates: [], total: 0 };
  }
  
  return {
    candidates: (data || []) as unknown as ProductCandidate[],
    total: count || 0,
  };
}

/**
 * Get a single candidate by ID.
 */
export async function getCandidate(candidateId: string): Promise<ProductCandidate | null> {
  const { data, error } = await supabaseAdmin
    .from('product_import_candidates')
    .select('*')
    .eq('id', candidateId)
    .single();
    
  if (error || !data) return null;
  
  return data as unknown as ProductCandidate;
}
