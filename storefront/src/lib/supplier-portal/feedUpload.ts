/**
 * Supplier Feed Upload Processing
 * 
 * Pipeline: upload → parse → AI extraction → normalization → preview → commit
 * 
 * Supports:
 * - CSV files
 * - XLSX files (via SheetJS)
 */

import * as XLSX from 'xlsx';
import { supabaseAdmin, getSupabaseCatalogos } from '../jobs/supabase';
import { buildSupplierOfferUpsertRow } from '../../../../lib/supplier-offer-normalization';
import { logAuditEvent } from './auth';
import { logIngestionFailure, logAIExtractionFailure, logTransactionFailure } from '../hardening/telemetry';

// Minimum confidence required for auto-normalization
const MIN_EXTRACTION_CONFIDENCE = 0.5;

// ============================================================================
// TYPES
// ============================================================================

export type UploadStatus = 
  | 'pending'
  | 'parsing'
  | 'extracting'
  | 'normalizing'
  | 'preview'
  | 'committed'
  | 'failed';

export interface FeedUpload {
  id: string;
  supplier_id: string;
  user_id: string;
  filename: string;
  file_type: 'csv' | 'xlsx' | 'price_sheet';
  status: UploadStatus;
  total_rows: number;
  processed_rows: number;
  error_rows: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface ParsedRow {
  row_number: number;
  raw_data: Record<string, string>;
  extracted: ExtractedProduct;
  normalized: NormalizedProduct;
  validation: ValidationResult;
  status: 'valid' | 'warning' | 'error';
}

export interface ExtractedProduct {
  sku?: string;
  product_name?: string;
  price?: number;
  case_pack?: number;
  box_quantity?: number;
  unit_of_measure?: string;
  material?: string;
  size?: string;
  color?: string;
  lead_time_days?: number;
  moq?: number;
  shipping_notes?: string;
  confidence: Record<string, number>;
}

export interface NormalizedProduct {
  matched_product_id?: string;
  matched_product_name?: string;
  match_confidence: number;
  match_method: 'exact_sku' | 'fuzzy_name' | 'attribute_match' | 'ai_inference' | 'no_match';
  price_normalized: number;
  price_per_unit: number;
  pack_size_normalized: number;
  unit_normalized: string;
}

export interface ValidationResult {
  is_valid: boolean;
  warnings: ValidationWarning[];
  errors: ValidationError[];
}

export interface ValidationWarning {
  type: 'price_anomaly' | 'pack_mismatch' | 'duplicate' | 'stale_match' | 'low_confidence';
  message: string;
  field?: string;
  details?: Record<string, unknown>;
}

export interface ValidationError {
  type: 'missing_required' | 'invalid_format' | 'no_match' | 'parse_error';
  message: string;
  field?: string;
}

export interface FeedUploadResult {
  upload_id: string;
  status: UploadStatus;
  total_rows: number;
  valid_rows: number;
  warning_rows: number;
  error_rows: number;
  rows: ParsedRow[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const UPLOAD_CONFIG = {
  max_rows: 5000,
  max_file_size_bytes: 10 * 1024 * 1024, // 10 MB
  required_fields: ['price'],
  minimum_headers: ['price'], // At least one of these must be present
  recommended_headers: ['sku', 'product_name', 'price'],
  price_anomaly_threshold: 0.5, // 50% deviation from market
  confidence_warning_threshold: 0.7,
  duplicate_check_window_days: 7,
};

// ============================================================================
// FILE VALIDATION
// ============================================================================

export interface FileValidationResult {
  valid: boolean;
  file_type: 'csv' | 'xlsx' | 'unknown';
  errors: string[];
  warnings: string[];
  row_count?: number;
  headers?: string[];
}

/**
 * Detect file type from filename extension or content.
 */
export function detectFileType(filename: string, content?: ArrayBuffer): 'csv' | 'xlsx' | 'unknown' {
  const ext = filename.toLowerCase().split('.').pop();
  
  if (ext === 'csv') return 'csv';
  if (ext === 'xlsx' || ext === 'xls') return 'xlsx';
  
  // Try to detect from content if available
  if (content) {
    const bytes = new Uint8Array(content.slice(0, 4));
    // XLSX files start with PK (ZIP signature)
    if (bytes[0] === 0x50 && bytes[1] === 0x4B) return 'xlsx';
  }
  
  return 'unknown';
}

/**
 * Validate file before processing.
 */
export function validateFile(
  filename: string,
  content: string | ArrayBuffer | Uint8Array,
  file_type: 'csv' | 'xlsx'
): FileValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check file size
  let size: number;
  if (typeof content === 'string') {
    size = content.length;
  } else if (content instanceof Uint8Array) {
    size = content.byteLength;
  } else if (content instanceof ArrayBuffer) {
    size = content.byteLength;
  } else {
    size = 0;
  }
  
  if (size > UPLOAD_CONFIG.max_file_size_bytes) {
    errors.push(`File too large: ${(size / 1024 / 1024).toFixed(1)}MB exceeds ${UPLOAD_CONFIG.max_file_size_bytes / 1024 / 1024}MB limit`);
  }
  
  // Parse to check row count and headers
  let rows: Array<Record<string, string>> = [];
  let headers: string[] = [];
  let totalRowsInFile = 0;
  
  try {
    if (file_type === 'csv') {
      const text = typeof content === 'string' 
        ? content 
        : content instanceof Uint8Array
          ? new TextDecoder().decode(content)
          : new TextDecoder().decode(new Uint8Array(content));
      const parsed = parseCSVWithValidation(text);
      rows = parsed.rows;
      headers = parsed.headers;
      // Estimate total rows from original content
      totalRowsInFile = text.split(/\r?\n/).filter(l => l.trim()).length - 1;
    } else {
      const buffer = typeof content === 'string' 
        ? new TextEncoder().encode(content) 
        : content instanceof Uint8Array
          ? content
          : new Uint8Array(content);
      const parsed = parseXLSXWithValidation(buffer);
      rows = parsed.rows;
      headers = parsed.headers;
      totalRowsInFile = rows.length; // For XLSX, we get all rows during parse
    }
  } catch (error) {
    errors.push(`Failed to parse file: ${error instanceof Error ? error.message : String(error)}`);
    return { valid: false, file_type, errors, warnings };
  }
  
  // Check row count
  if (rows.length === 0) {
    errors.push('No data rows found in file');
  } else if (totalRowsInFile > UPLOAD_CONFIG.max_rows) {
    errors.push(`Too many rows: ${totalRowsInFile} exceeds limit of ${UPLOAD_CONFIG.max_rows}`);
  }
  
  // Check headers
  if (headers.length === 0) {
    errors.push('No headers found in file');
  } else {
    // Check for required headers
    const normalizedHeaders = headers.map(h => normalizeHeader(h));
    const hasPrice = normalizedHeaders.some(h => 
      FIELD_MAPPINGS.price.some(alias => h.includes(alias))
    );
    
    if (!hasPrice) {
      errors.push('Missing required price column');
    }
    
    // Warn about missing recommended headers
    const hasSku = normalizedHeaders.some(h => 
      FIELD_MAPPINGS.sku.some(alias => h.includes(alias))
    );
    const hasProductName = normalizedHeaders.some(h => 
      FIELD_MAPPINGS.product_name.some(alias => h.includes(alias))
    );
    
    if (!hasSku && !hasProductName) {
      warnings.push('Neither SKU nor product name column found - matching will be difficult');
    }
  }
  
  return {
    valid: errors.length === 0,
    file_type,
    errors,
    warnings,
    row_count: rows.length,
    headers,
  };
}

// ============================================================================
// UPLOAD CREATION
// ============================================================================

export async function createFeedUpload(
  supplier_id: string,
  user_id: string,
  filename: string,
  file_type: 'csv' | 'xlsx' | 'price_sheet'
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .insert({
      supplier_id,
      user_id,
      filename,
      file_type,
      status: 'pending',
      total_rows: 0,
      processed_rows: 0,
      error_rows: 0,
    })
    .select()
    .single();
    
  if (error) throw new Error('Failed to create upload record');
  
  await logAuditEvent(supplier_id, user_id, 'create_feed_upload', 'supplier_feed_upload', data.id, {
    filename,
    file_type,
  });
  
  return data.id;
}

// ============================================================================
// CSV PARSING
// ============================================================================

interface ParsedFile {
  headers: string[];
  rows: Array<Record<string, string>>;
}

/**
 * Parse CSV with validation, returning headers and rows.
 */
function parseCSVWithValidation(content: string): ParsedFile {
  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 1) {
    return { headers: [], rows: [] };
  }
  
  // Parse header
  const rawHeaders = parseCSVLine(lines[0]);
  const headers = rawHeaders.map(h => normalizeHeader(h));
  
  if (lines.length < 2) {
    return { headers, rows: [] };
  }
  
  // Parse rows (skip header row)
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length && i <= UPLOAD_CONFIG.max_rows; i++) {
    const line = lines[i].trim();
    if (!line) continue; // Skip empty lines
    
    const values = parseCSVLine(line);
    const row: Record<string, string> = {};
    
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] || '';
    }
    
    rows.push(row);
  }
  
  return { headers, rows };
}

/**
 * Parse CSV content into array of row objects (legacy API).
 */
export function parseCSV(content: string): Array<Record<string, string>> {
  return parseCSVWithValidation(content).rows;
}

/**
 * Parse a single CSV line, handling quoted fields with commas.
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current.trim());
  return result;
}

/**
 * Normalize header to lowercase snake_case.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

// ============================================================================
// XLSX PARSING (SheetJS)
// ============================================================================

/**
 * Parse XLSX file with validation, returning headers and rows.
 */
function parseXLSXWithValidation(content: ArrayBuffer | Uint8Array): ParsedFile {
  try {
    const workbook = XLSX.read(content, { type: 'array' });
    
    // Get first sheet
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return { headers: [], rows: [] };
    }
    
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON with header row
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1, // Return array of arrays
      defval: '', // Default value for empty cells
      blankrows: false, // Skip blank rows
    }) as unknown[][];
    
    if (jsonData.length < 1) {
      return { headers: [], rows: [] };
    }
    
    // First row is headers
    const rawHeaders = (jsonData[0] || []).map(h => String(h ?? ''));
    const headers = rawHeaders.map(h => normalizeHeader(h));
    
    if (jsonData.length < 2) {
      return { headers, rows: [] };
    }
    
    // Convert remaining rows to objects
    const rows: Array<Record<string, string>> = [];
    for (let i = 1; i < jsonData.length && i <= UPLOAD_CONFIG.max_rows; i++) {
      const rowArray = jsonData[i] || [];
      const row: Record<string, string> = {};
      
      for (let j = 0; j < headers.length; j++) {
        const value = rowArray[j];
        // Handle different cell types - numbers, dates, strings
        row[headers[j]] = formatCellValue(value);
      }
      
      rows.push(row);
    }
    
    return { headers, rows };
  } catch (error) {
    throw new Error(`XLSX parsing failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Parse XLSX content into array of row objects (legacy API).
 */
export function parseXLSX(content: ArrayBuffer | Uint8Array): Array<Record<string, string>> {
  return parseXLSXWithValidation(content).rows;
}

/**
 * Format cell value to string, handling numbers, dates, and empty cells.
 */
function formatCellValue(value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '';
  }
  
  // Numbers - preserve precision
  if (typeof value === 'number') {
    // Check if it looks like a price (has decimal places)
    if (!Number.isInteger(value)) {
      return value.toFixed(2);
    }
    return String(value);
  }
  
  // Booleans
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  // Dates (Excel stores dates as numbers)
  if (value instanceof Date) {
    return value.toISOString().split('T')[0];
  }
  
  // Everything else as string
  return String(value).trim();
}

/**
 * Parse file content based on file type.
 * Returns normalized rows in the same format regardless of source.
 */
export function parseFileContent(
  content: string | ArrayBuffer | Uint8Array,
  file_type: 'csv' | 'xlsx'
): Array<Record<string, string>> {
  if (file_type === 'csv') {
    const text = typeof content === 'string' 
      ? content 
      : content instanceof Uint8Array
        ? new TextDecoder().decode(content)
        : new TextDecoder().decode(new Uint8Array(content));
    return parseCSV(text);
  } else {
    const buffer = typeof content === 'string'
      ? new TextEncoder().encode(content)
      : content instanceof Uint8Array
        ? content
        : new Uint8Array(content);
    return parseXLSX(buffer);
  }
}

// ============================================================================
// FIELD EXTRACTION
// ============================================================================

const FIELD_MAPPINGS: Record<string, string[]> = {
  sku: ['sku', 'item_number', 'item_no', 'product_code', 'part_number', 'upc', 'item_id'],
  product_name: ['product_name', 'name', 'description', 'product', 'item_name', 'item_description', 'title'],
  price: ['price', 'unit_price', 'cost', 'list_price', 'sell_price', 'each_price'],
  case_pack: ['case_pack', 'pack_size', 'units_per_case', 'qty_per_case', 'case_qty', 'pack'],
  box_quantity: ['box_quantity', 'box_qty', 'boxes_per_case', 'inner_pack'],
  unit_of_measure: ['unit', 'uom', 'unit_of_measure', 'measure'],
  material: ['material', 'composition', 'type'],
  size: ['size', 'glove_size', 'dimensions'],
  color: ['color', 'colour'],
  lead_time_days: ['lead_time', 'lead_time_days', 'delivery_days', 'ship_days'],
  moq: ['moq', 'min_order', 'minimum_order', 'min_qty'],
  shipping_notes: ['shipping_notes', 'shipping', 'notes', 'comments'],
};

export function extractFields(row: Record<string, string>): ExtractedProduct {
  const extracted: ExtractedProduct = { confidence: {} };
  const rowKeys = Object.keys(row);
  
  for (const [field, aliases] of Object.entries(FIELD_MAPPINGS)) {
    // Find matching column
    const matchedKey = rowKeys.find(k => 
      aliases.some(a => k.toLowerCase().includes(a))
    );
    
    if (matchedKey && row[matchedKey]) {
      const value = row[matchedKey].trim();
      
      switch (field) {
        case 'sku':
          extracted.sku = value;
          extracted.confidence.sku = 1.0;
          break;
        case 'product_name':
          extracted.product_name = value;
          extracted.confidence.product_name = 1.0;
          break;
        case 'price':
          const price = parsePrice(value);
          if (price !== null) {
            extracted.price = price;
            extracted.confidence.price = 1.0;
          }
          break;
        case 'case_pack':
          const casePack = parseInt(value);
          if (!isNaN(casePack)) {
            extracted.case_pack = casePack;
            extracted.confidence.case_pack = 1.0;
          }
          break;
        case 'box_quantity':
          const boxQty = parseInt(value);
          if (!isNaN(boxQty)) {
            extracted.box_quantity = boxQty;
            extracted.confidence.box_quantity = 1.0;
          }
          break;
        case 'unit_of_measure':
          extracted.unit_of_measure = value;
          extracted.confidence.unit_of_measure = 0.9;
          break;
        case 'material':
          extracted.material = extractMaterial(value);
          extracted.confidence.material = 0.8;
          break;
        case 'size':
          extracted.size = extractSize(value);
          extracted.confidence.size = 0.9;
          break;
        case 'color':
          extracted.color = value;
          extracted.confidence.color = 0.9;
          break;
        case 'lead_time_days':
          const leadTime = parseInt(value);
          if (!isNaN(leadTime)) {
            extracted.lead_time_days = leadTime;
            extracted.confidence.lead_time_days = 1.0;
          }
          break;
        case 'moq':
          const moq = parseInt(value);
          if (!isNaN(moq)) {
            extracted.moq = moq;
            extracted.confidence.moq = 1.0;
          }
          break;
        case 'shipping_notes':
          extracted.shipping_notes = value;
          extracted.confidence.shipping_notes = 1.0;
          break;
      }
    }
  }
  
  // Try AI extraction for missing fields from product_name
  if (extracted.product_name) {
    aiExtractFromName(extracted);
  }
  
  return extracted;
}

function parsePrice(value: string): number | null {
  // Remove currency symbols and whitespace
  const cleaned = value.replace(/[$€£¥,\s]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? null : price;
}

function extractMaterial(value: string): string {
  const lower = value.toLowerCase();
  if (lower.includes('nitrile')) return 'nitrile';
  if (lower.includes('latex')) return 'latex';
  if (lower.includes('vinyl')) return 'vinyl';
  if (lower.includes('neoprene')) return 'neoprene';
  if (lower.includes('poly')) return 'poly';
  return value;
}

function extractSize(value: string): string {
  const lower = value.toLowerCase().trim();
  
  // Standard sizes
  if (lower === 'xs' || lower === 'x-small' || lower === 'extra small') return 'XS';
  if (lower === 's' || lower === 'small' || lower === 'sm') return 'S';
  if (lower === 'm' || lower === 'medium' || lower === 'med') return 'M';
  if (lower === 'l' || lower === 'large' || lower === 'lg') return 'L';
  if (lower === 'xl' || lower === 'x-large' || lower === 'extra large') return 'XL';
  if (lower === 'xxl' || lower === '2xl' || lower === 'xx-large') return 'XXL';
  
  return value.toUpperCase();
}

function aiExtractFromName(extracted: ExtractedProduct): void {
  const name = (extracted.product_name || '').toLowerCase();
  
  // Extract material from name if not already set
  if (!extracted.material) {
    if (name.includes('nitrile')) {
      extracted.material = 'nitrile';
      extracted.confidence.material = 0.85;
    } else if (name.includes('latex')) {
      extracted.material = 'latex';
      extracted.confidence.material = 0.85;
    } else if (name.includes('vinyl')) {
      extracted.material = 'vinyl';
      extracted.confidence.material = 0.85;
    }
  }
  
  // Extract size from name if not already set
  if (!extracted.size) {
    const sizeMatch = name.match(/\b(xs|x-small|small|medium|large|x-large|xl|xxl|2xl)\b/i);
    if (sizeMatch) {
      extracted.size = extractSize(sizeMatch[1]);
      extracted.confidence.size = 0.75;
    }
  }
  
  // Extract pack size from name
  if (!extracted.case_pack) {
    const packMatch = name.match(/(\d+)\s*(ct|count|pk|pack|\/case|per case)/i);
    if (packMatch) {
      extracted.case_pack = parseInt(packMatch[1]);
      extracted.confidence.case_pack = 0.7;
    }
  }
  
  // Look for powder-free indicator
  if (name.includes('powder-free') || name.includes('powder free') || name.includes('pf')) {
    // This would set a powder_free attribute if we had one
  }
}

/**
 * Calculate average confidence across all extracted fields.
 */
function calculateAverageConfidence(confidence: Record<string, number>): number {
  const values = Object.values(confidence);
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// ============================================================================
// NORMALIZATION & MATCHING
// ============================================================================

export async function normalizeAndMatch(
  supplier_id: string,
  extracted: ExtractedProduct
): Promise<NormalizedProduct> {
  const result: NormalizedProduct = {
    match_confidence: 0,
    match_method: 'no_match',
    price_normalized: extracted.price || 0,
    price_per_unit: 0,
    pack_size_normalized: extracted.case_pack || 1,
    unit_normalized: extracted.unit_of_measure || 'each',
  };
  
  // Try exact SKU match first
  if (extracted.sku) {
    const { data: skuMatch } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name')
      .eq('sku', extracted.sku)
      .eq('is_active', true)
      .single();
      
    if (skuMatch) {
      result.matched_product_id = skuMatch.id;
      result.matched_product_name = skuMatch.name;
      result.match_confidence = 1.0;
      result.match_method = 'exact_sku';
    }
  }
  
  // Try fuzzy name match if no SKU match
  if (!result.matched_product_id && extracted.product_name) {
    const { data: nameMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .ilike('name', `%${extracted.product_name.slice(0, 30)}%`)
      .limit(5);
      
    if (nameMatches && nameMatches.length > 0) {
      // Score each match
      const scored = nameMatches.map(m => ({
        ...m,
        score: calculateNameSimilarity(extracted.product_name!, m.name),
      }));
      
      const best = scored.sort((a, b) => b.score - a.score)[0];
      
      if (best.score >= 0.6) {
        result.matched_product_id = best.id;
        result.matched_product_name = best.name;
        result.match_confidence = best.score;
        result.match_method = 'fuzzy_name';
      }
    }
  }
  
  // Try attribute-based matching
  if (!result.matched_product_id && extracted.material && extracted.size) {
    const { data: attrMatches } = await getSupabaseCatalogos()
      .from('products')
      .select('id, name')
      .eq('is_active', true)
      .ilike('name', `%${extracted.material}%`)
      .ilike('name', `%${extracted.size}%`)
      .limit(5);
      
    if (attrMatches && attrMatches.length > 0) {
      result.matched_product_id = attrMatches[0].id;
      result.matched_product_name = attrMatches[0].name;
      result.match_confidence = 0.6;
      result.match_method = 'attribute_match';
    }
  }
  
  // Calculate price per unit
  const packSize = result.pack_size_normalized || 1;
  result.price_per_unit = result.price_normalized / packSize;
  
  return result;
}

function calculateNameSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  // Exact match
  if (aLower === bLower) return 1.0;
  
  // Token-based similarity
  const aTokens = new Set(aLower.split(/\s+/));
  const bTokens = new Set(bLower.split(/\s+/));
  
  let matches = 0;
  for (const token of Array.from(aTokens)) {
    if (bTokens.has(token)) matches++;
  }
  
  const totalTokens = Math.max(aTokens.size, bTokens.size);
  return matches / totalTokens;
}

// ============================================================================
// VALIDATION
// ============================================================================

export async function validateRow(
  supplier_id: string,
  extracted: ExtractedProduct,
  normalized: NormalizedProduct
): Promise<ValidationResult> {
  const warnings: ValidationWarning[] = [];
  const errors: ValidationError[] = [];
  
  // Required field validation
  if (!extracted.price || extracted.price <= 0) {
    errors.push({
      type: 'missing_required',
      field: 'price',
      message: 'Price is required and must be greater than 0',
    });
  }
  
  if (!extracted.product_name && !extracted.sku) {
    errors.push({
      type: 'missing_required',
      field: 'product_name',
      message: 'Either product name or SKU is required',
    });
  }
  
  // No match warning
  if (normalized.match_method === 'no_match') {
    warnings.push({
      type: 'low_confidence',
      message: 'Could not match to existing product - manual review required',
    });
  }
  
  // Low confidence warning
  if (normalized.match_confidence > 0 && normalized.match_confidence < UPLOAD_CONFIG.confidence_warning_threshold) {
    warnings.push({
      type: 'low_confidence',
      message: `Match confidence is ${(normalized.match_confidence * 100).toFixed(0)}% - please verify`,
      details: { confidence: normalized.match_confidence },
    });
  }
  
  // Check for price anomaly if matched
  if (normalized.matched_product_id && extracted.price) {
    const anomaly = await checkPriceAnomaly(normalized.matched_product_id, extracted.price);
    if (anomaly) {
      warnings.push({
        type: 'price_anomaly',
        field: 'price',
        message: anomaly.message,
        details: anomaly.details,
      });
    }
  }
  
  // Check for pack mismatch
  if (normalized.matched_product_id && extracted.case_pack) {
    const packMismatch = await checkPackMismatch(normalized.matched_product_id, extracted.case_pack);
    if (packMismatch) {
      warnings.push({
        type: 'pack_mismatch',
        field: 'case_pack',
        message: packMismatch.message,
        details: packMismatch.details,
      });
    }
  }
  
  // Check for duplicate
  if (normalized.matched_product_id) {
    const duplicate = await checkDuplicate(supplier_id, normalized.matched_product_id);
    if (duplicate) {
      warnings.push({
        type: 'duplicate',
        message: duplicate.message,
        details: duplicate.details,
      });
    }
  }
  
  // Check extraction confidence
  for (const [field, confidence] of Object.entries(extracted.confidence)) {
    if (confidence < UPLOAD_CONFIG.confidence_warning_threshold) {
      warnings.push({
        type: 'low_confidence',
        field,
        message: `${field} extraction confidence is ${(confidence * 100).toFixed(0)}%`,
        details: { confidence },
      });
    }
  }
  
  return {
    is_valid: errors.length === 0,
    warnings,
    errors,
  };
}

function comparableOfferListPrice(row: { cost: unknown; sell_price: unknown }): number | null {
  const sell = row.sell_price != null ? Number(row.sell_price) : null;
  if (sell != null && Number.isFinite(sell)) return sell;
  const cost = Number(row.cost);
  return Number.isFinite(cost) ? cost : null;
}

async function checkPriceAnomaly(
  product_id: string,
  price: number
): Promise<{ message: string; details: Record<string, unknown> } | null> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('cost, sell_price')
    .eq('product_id', product_id)
    .eq('is_active', true);

  if (!offers || offers.length === 0) return null;

  const prices = offers
    .map((o) => comparableOfferListPrice(o as { cost: unknown; sell_price: unknown }))
    .filter((p): p is number => p != null && p > 0);
  if (prices.length === 0) return null;

  const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
  if (!Number.isFinite(avgPrice) || avgPrice <= 0) return null;

  const deviation = Math.abs(price - avgPrice) / avgPrice;

  if (deviation > UPLOAD_CONFIG.price_anomaly_threshold) {
    return {
      message: `Price ${price > avgPrice ? 'significantly higher' : 'significantly lower'} than market average ($${avgPrice.toFixed(2)})`,
      details: {
        your_price: price,
        market_avg: avgPrice,
        deviation_percent: (deviation * 100).toFixed(0),
      },
    };
  }

  return null;
}

async function checkPackMismatch(
  product_id: string,
  case_pack: number
): Promise<{ message: string; details: Record<string, unknown> } | null> {
  const { data: offers } = await supabaseAdmin
    .from('supplier_offers')
    .select('units_per_case')
    .eq('product_id', product_id)
    .eq('is_active', true)
    .not('units_per_case', 'is', null);

  if (!offers || offers.length === 0) return null;

  const commonPacks = new Set(
    offers
      .map((o) => Number((o as { units_per_case: unknown }).units_per_case))
      .filter((n) => Number.isFinite(n) && n > 0)
      .map((n) => Math.trunc(n))
  );

  if (commonPacks.size === 0) return null;

  const yourPack = Math.trunc(case_pack);
  if (!commonPacks.has(yourPack)) {
    return {
      message: `Pack size ${yourPack} differs from common sizes: ${Array.from(commonPacks).join(', ')}`,
      details: {
        your_pack: yourPack,
        common_packs: Array.from(commonPacks),
      },
    };
  }

  return null;
}

async function checkDuplicate(
  supplier_id: string,
  product_id: string
): Promise<{ message: string; details: Record<string, unknown> } | null> {
  const { data: existing } = await supabaseAdmin
    .from('supplier_offers')
    .select('id, price, updated_at')
    .eq('supplier_id', supplier_id)
    .eq('product_id', product_id)
    .eq('is_active', true)
    .single();
    
  if (existing) {
    return {
      message: 'You already have an active offer for this product - this will update it',
      details: {
        existing_offer_id: existing.id,
        existing_price: existing.price,
        last_updated: existing.updated_at,
      },
    };
  }
  
  return null;
}

// ============================================================================
// FULL PROCESSING PIPELINE
// ============================================================================

export async function processFeedUpload(
  upload_id: string,
  supplier_id: string,
  user_id: string,
  content: string | ArrayBuffer,
  file_type: 'csv' | 'xlsx' | 'price_sheet'
): Promise<FeedUploadResult> {
  // Update status to parsing
  await updateUploadStatus(upload_id, 'parsing');
  
  // Parse content based on file type
  let rawRows: Array<Record<string, string>>;
  
  try {
    // Determine actual parsing method
    const parseType = file_type === 'price_sheet' ? 'csv' : file_type;
    rawRows = parseFileContent(content, parseType as 'csv' | 'xlsx');
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Failed to parse file';
    await updateUploadStatus(upload_id, 'failed', errorMsg);
    
    // Log ingestion failure
    await logIngestionFailure(errorMsg, {
      supplier_id,
      upload_id,
      file_type,
      error_code: 'PARSE_FAILED',
    });
    
    throw new Error(errorMsg);
  }
  
  if (rawRows.length === 0) {
    await updateUploadStatus(upload_id, 'failed', 'No data rows found');
    throw new Error('No data rows found');
  }
  
  // Update total rows
  await supabaseAdmin
    .from('supplier_feed_uploads')
    .update({ total_rows: rawRows.length })
    .eq('id', upload_id);
  
  // Process each row
  await updateUploadStatus(upload_id, 'extracting');
  
  const processedRows: ParsedRow[] = [];
  let errorCount = 0;
  
  for (let i = 0; i < rawRows.length; i++) {
    const row = rawRows[i];
    
    // Extract fields
    const extracted = extractFields(row);
    
    // Check extraction confidence floor before auto-normalization
    const avgConfidence = calculateAverageConfidence(extracted.confidence);
    
    // Normalize and match (only if confidence meets threshold)
    await updateUploadStatus(upload_id, 'normalizing');
    let normalized: NormalizedProduct;
    
    if (avgConfidence >= MIN_EXTRACTION_CONFIDENCE) {
      normalized = await normalizeAndMatch(supplier_id, extracted);
    } else {
      // Low confidence - skip auto-normalization, require manual review
      normalized = {
        match_confidence: 0,
        match_method: 'no_match',
        price_normalized: extracted.price || 0,
        price_per_unit: extracted.price || 0,
        pack_size_normalized: extracted.case_pack || 1,
        unit_normalized: extracted.unit_of_measure || 'EA',
      };
      
      // Log low confidence extraction
      await logAIExtractionFailure('Extraction confidence below threshold', {
        supplier_id,
        product_name: extracted.product_name,
        confidence: avgConfidence,
        extraction_type: 'feed_upload',
      });
    }
    
    // Validate
    const validation = await validateRow(supplier_id, extracted, normalized);
    
    if (!validation.is_valid) errorCount++;
    
    processedRows.push({
      row_number: i + 1,
      raw_data: row,
      extracted,
      normalized,
      validation,
      status: !validation.is_valid ? 'error' : validation.warnings.length > 0 ? 'warning' : 'valid',
    });
    
    // Update progress every 10 rows
    if (i % 10 === 0) {
      await supabaseAdmin
        .from('supplier_feed_uploads')
        .update({ processed_rows: i + 1 })
        .eq('id', upload_id);
    }
  }
  
  // Update final status
  await supabaseAdmin
    .from('supplier_feed_uploads')
    .update({
      status: 'preview',
      processed_rows: rawRows.length,
      error_rows: errorCount,
    })
    .eq('id', upload_id);
  
  // Store processed rows for preview
  await storeProcessedRows(upload_id, processedRows);
  
  return {
    upload_id,
    status: 'preview',
    total_rows: rawRows.length,
    valid_rows: processedRows.filter(r => r.status === 'valid').length,
    warning_rows: processedRows.filter(r => r.status === 'warning').length,
    error_rows: errorCount,
    rows: processedRows,
  };
}

async function updateUploadStatus(
  upload_id: string,
  status: UploadStatus,
  error_message?: string
): Promise<void> {
  await supabaseAdmin
    .from('supplier_feed_uploads')
    .update({
      status,
      error_message,
      ...(status === 'committed' || status === 'failed' ? { completed_at: new Date().toISOString() } : {}),
    })
    .eq('id', upload_id);
}

async function storeProcessedRows(
  upload_id: string,
  rows: ParsedRow[]
): Promise<void> {
  // Store in a temporary table for preview
  await supabaseAdmin
    .from('supplier_feed_upload_rows')
    .delete()
    .eq('upload_id', upload_id);
    
  const rowsToInsert = rows.map(r => ({
    upload_id,
    row_number: r.row_number,
    raw_data: r.raw_data,
    extracted: r.extracted,
    normalized: r.normalized,
    validation: r.validation,
    status: r.status,
  }));
  
  // Insert in batches
  const batchSize = 100;
  for (let i = 0; i < rowsToInsert.length; i += batchSize) {
    const batch = rowsToInsert.slice(i, i + batchSize);
    await supabaseAdmin.from('supplier_feed_upload_rows').insert(batch);
  }
}

// ============================================================================
// ROW CORRECTION
// ============================================================================

export async function correctRow(
  upload_id: string,
  supplier_id: string,
  row_number: number,
  corrections: Partial<ExtractedProduct>
): Promise<ParsedRow> {
  // SECURITY: Verify upload belongs to requesting supplier
  const isOwner = await verifyUploadOwnership(upload_id, supplier_id);
  if (!isOwner) {
    throw new Error('Upload not found or access denied');
  }
  
  // Get existing row
  const { data: existing } = await supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('*')
    .eq('upload_id', upload_id)
    .eq('row_number', row_number)
    .single();
    
  if (!existing) throw new Error('Row not found');
  
  // Apply corrections
  const extracted = { ...existing.extracted, ...corrections } as ExtractedProduct;
  
  // Mark corrected fields as high confidence
  for (const field of Object.keys(corrections)) {
    extracted.confidence[field] = 1.0;
  }
  
  // Re-normalize (supplier_id already verified above)
  const normalized = await normalizeAndMatch(supplier_id, extracted);
  
  // Re-validate
  const validation = await validateRow(supplier_id, extracted, normalized);
  
  const status = !validation.is_valid ? 'error' : validation.warnings.length > 0 ? 'warning' : 'valid';
  
  // Update row
  await supabaseAdmin
    .from('supplier_feed_upload_rows')
    .update({
      extracted,
      normalized,
      validation,
      status,
    })
    .eq('upload_id', upload_id)
    .eq('row_number', row_number);
    
  return {
    row_number,
    raw_data: existing.raw_data,
    extracted,
    normalized,
    validation,
    status,
  };
}

// ============================================================================
// COMMIT (TypeScript path: explicit normalizeSupplierOfferPricing via buildSupplierOfferUpsertRow)
// ============================================================================

export async function commitFeedUpload(
  upload_id: string,
  supplier_id: string,
  user_id: string,
  row_numbers?: number[]
): Promise<{
  committed: number;
  created: number;
  updated: number;
  skipped: number;
}> {
  // SECURITY: Verify upload belongs to requesting supplier before committing
  const isOwner = await verifyUploadOwnership(upload_id, supplier_id);
  if (!isOwner) {
    throw new Error('Upload not found or access denied');
  }
  
  // Get rows to commit
  let query = supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('*')
    .eq('upload_id', upload_id)
    .in('status', ['valid', 'warning']);
    
  if (row_numbers && row_numbers.length > 0) {
    query = query.in('row_number', row_numbers);
  }
  
  const { data: rows } = await query;
  
  if (!rows || rows.length === 0) {
    return { committed: 0, created: 0, updated: 0, skipped: 0 };
  }
  
  try {
    const catalogos = getSupabaseCatalogos();
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const row of rows) {
      const extracted = row.extracted as ExtractedProduct;
      const normalized = row.normalized as NormalizedProduct;
      const matchedProductId = normalized.matched_product_id;
      if (!matchedProductId) {
        skipped += 1;
        continue;
      }
      const vPrice = extracted.price;
      if (vPrice == null || vPrice < 0 || !Number.isFinite(Number(vPrice))) {
        skipped += 1;
        continue;
      }
      const costNum = Number(vPrice);
      const vSku = extracted.sku != null ? String(extracted.sku).trim() : '';
      const leadRaw = extracted.lead_time_days;
      const leadTimeDays =
        leadRaw != null && Number.isFinite(Number(leadRaw)) ? Math.trunc(Number(leadRaw)) : null;
      const casePack = extracted.case_pack;
      const unitsPerCase =
        typeof casePack === 'number' && Number.isFinite(casePack) && casePack > 0
          ? Math.trunc(casePack)
          : null;

      const { data: existing, error: findErr } = await catalogos
        .from('supplier_offers')
        .select('id')
        .eq('supplier_id', supplier_id)
        .eq('product_id', matchedProductId)
        .limit(1)
        .maybeSingle();
      if (findErr) throw new Error(findErr.message);

      const defaultSku = `IMPORT-${matchedProductId}`;
      const supplierSku = vSku.length > 0 ? vSku : defaultSku;

      const pricingInput = {
        currency_code: 'USD' as const,
        cost_basis: 'per_case' as const,
        cost: costNum,
        units_per_case: unitsPerCase ?? undefined,
      };

      if (existing?.id) {
        const patch = buildSupplierOfferUpsertRow(
          {
            supplier_sku: supplierSku,
            cost: costNum,
            sell_price: costNum,
            lead_time_days: leadTimeDays,
            is_active: true,
            units_per_case: unitsPerCase,
          },
          pricingInput
        );
        const { error: upErr } = await catalogos
          .from('supplier_offers')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', (existing as { id: string }).id);
        if (upErr) throw new Error(upErr.message);
        updated += 1;
      } else {
        const insertRow = buildSupplierOfferUpsertRow(
          {
            supplier_id,
            product_id: matchedProductId,
            supplier_sku: supplierSku,
            cost: costNum,
            sell_price: costNum,
            lead_time_days: leadTimeDays,
            raw_id: null,
            normalized_id: null,
            is_active: true,
            units_per_case: unitsPerCase,
          },
          pricingInput
        );
        const { error: insErr } = await catalogos.from('supplier_offers').insert(insertRow);
        if (insErr) throw new Error(insErr.message);
        created += 1;
      }
    }

    const committed = created + updated;
    await updateUploadStatus(upload_id, 'committed');
    await logAuditEvent(supplier_id, user_id, 'commit_feed_upload', 'supplier_feed_upload', upload_id, {
      committed,
      created,
      updated,
      skipped,
    });
    return { committed, created, updated, skipped };
  } catch (error) {
    await logTransactionFailure('Feed upload commit failed', {
      operation: 'commit_feed_upload',
      table: 'supplier_offers',
      error_code: 'COMMIT_FAILED',
    });
    await logIngestionFailure('Feed commit transaction failed', {
      supplier_id,
      upload_id,
      error_code: 'COMMIT_FAILED',
    });
    await updateUploadStatus(upload_id, 'failed');
    throw error;
  }
}

// ============================================================================
// RETRIEVAL
// ============================================================================

/**
 * Verify that an upload belongs to the given supplier.
 * This is a critical security check to prevent cross-supplier data access.
 */
async function verifyUploadOwnership(
  upload_id: string,
  supplier_id: string
): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('id')
    .eq('id', upload_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  return !!data;
}

export async function getUploadRows(
  upload_id: string,
  supplier_id: string,
  filter?: 'all' | 'valid' | 'warning' | 'error'
): Promise<ParsedRow[]> {
  // SECURITY: Verify upload belongs to requesting supplier
  const isOwner = await verifyUploadOwnership(upload_id, supplier_id);
  if (!isOwner) {
    throw new Error('Upload not found or access denied');
  }
  
  let query = supabaseAdmin
    .from('supplier_feed_upload_rows')
    .select('*')
    .eq('upload_id', upload_id)
    .order('row_number', { ascending: true });
    
  if (filter && filter !== 'all') {
    query = query.eq('status', filter);
  }
  
  const { data } = await query;
  
  if (!data) return [];
  
  return data.map(d => ({
    row_number: d.row_number,
    raw_data: d.raw_data as Record<string, string>,
    extracted: d.extracted as ExtractedProduct,
    normalized: d.normalized as NormalizedProduct,
    validation: d.validation as ValidationResult,
    status: d.status as 'valid' | 'warning' | 'error',
  }));
}

export async function getUploadStatus(
  upload_id: string,
  supplier_id: string
): Promise<FeedUpload | null> {
  // SECURITY: Only return upload if it belongs to requesting supplier
  const { data } = await supabaseAdmin
    .from('supplier_feed_uploads')
    .select('*')
    .eq('id', upload_id)
    .eq('supplier_id', supplier_id)
    .single();
    
  if (!data) return null;
  
  return data as FeedUpload;
}
