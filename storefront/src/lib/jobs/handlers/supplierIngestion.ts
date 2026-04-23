/**
 * Supplier Ingestion Job Handler
 * 
 * Processes uploaded supplier files/feeds (CSV, XLSX, JSON) and creates staging records.
 * 
 * Processing Flow:
 * 1. Load file from Supabase Storage or provided URL
 * 2. Parse based on format (CSV, XLSX, JSON)
 * 3. Validate and checksum each row
 * 4. Persist to supplier_products_raw (immutable) and supplier_products_normalized (staging)
 * 5. Create review items for problematic rows
 * 6. Enqueue product_normalization jobs for valid rows
 * 
 * Triggered by: supplier_file_uploaded event
 */

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';
import { emitSystemEvent } from '../../events/emit';
import { createReviewItem } from '../../review/createReviewItem';
import type { 
  JobExecutionResult, 
  SupplierIngestionPayload,
  ReviewQueueCreateInput,
  EnqueueJobInput 
} from '../../agents/types';
import crypto from 'crypto';

// ============================================================================
// TYPES
// ============================================================================

interface ParsedRow {
  index: number;
  external_id: string;
  raw_data: Record<string, unknown>;
  checksum: string;
  parse_success: boolean;
  parse_error?: string;
  validation_issues: string[];
}

interface FileMetadata {
  name?: string;
  size?: number;
  mimetype?: string;
  storage_path?: string;
}

// ============================================================================
// HANDLER
// ============================================================================

export async function handleSupplierIngestion(
  payload: Record<string, unknown>
): Promise<JobExecutionResult> {
  const input = payload as SupplierIngestionPayload;
  const reviewItems: ReviewQueueCreateInput[] = [];
  const followupJobs: EnqueueJobInput[] = [];

  // Validate required inputs
  if (!input.supplier_id) {
    return {
      success: false,
      error: 'Missing required input: supplier_id',
    };
  }

  if (!input.file_id && !input.file_url && !input.file_content) {
    return {
      success: false,
      error: 'Missing required input: file_id, file_url, or file_content',
    };
  }

  try {
    logger.info('Starting supplier ingestion', {
      file_id: input.file_id,
      supplier_id: input.supplier_id,
      format: input.format,
    });

    // =========================================================================
    // STEP 1: CREATE IMPORT BATCH
    // =========================================================================
    const batchId = crypto.randomUUID();
    const { error: batchError } = await supabaseAdmin
      .from('import_batches')
      .insert({
        id: batchId,
        supplier_id: input.supplier_id,
        source_file: input.file_id || input.file_url || 'inline_content',
        status: 'processing',
        row_count: 0,
        created_at: new Date().toISOString(),
      });

    if (batchError) {
      logger.warn('Failed to create import batch, continuing without batch tracking', { 
        error: batchError.message 
      });
    }

    // =========================================================================
    // STEP 2: LOAD FILE CONTENT
    // =========================================================================
    let fileContent: string | Buffer;
    let fileMetadata: FileMetadata = {};

    if (input.file_content) {
      // Direct content provided (testing/API use)
      fileContent = input.file_content as string;
    } else if (input.file_url) {
      // Fetch from URL
      const response = await fetch(input.file_url);
      if (!response.ok) {
        throw new Error(`Failed to fetch file from URL: ${response.statusText}`);
      }
      fileContent = await response.text();
    } else if (input.file_id) {
      // Load from Supabase Storage
      const { data: fileData, error: fetchError } = await supabaseAdmin
        .storage
        .from('supplier-files')
        .download(input.file_id);

      if (fetchError || !fileData) {
        throw new Error(`Failed to download file: ${fetchError?.message || 'No data'}`);
      }

      fileContent = await fileData.text();
      fileMetadata = {
        name: input.file_id.split('/').pop(),
        size: fileData.size,
        storage_path: input.file_id,
      };
    } else {
      throw new Error('No file source provided');
    }

    // =========================================================================
    // STEP 3: DETECT FORMAT AND PARSE
    // =========================================================================
    const format = input.format || detectFormat(input.file_id || input.file_url || '', fileContent);
    logger.info('Detected file format', { format });

    let parsedRows: ParsedRow[];
    try {
      parsedRows = await parseFile(fileContent, format, input.column_mapping);
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : String(parseError);
      return {
        success: false,
        error: `File parsing failed: ${message}`,
        output: {
          file_id: input.file_id,
          format,
          stage: 'parsing',
        },
      };
    }

    // =========================================================================
    // STEP 4: PROCESS ROWS
    // =========================================================================
    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const seenExternalIds = new Set<string>();

    for (const row of parsedRows) {
      // Check for duplicates within file
      if (seenExternalIds.has(row.external_id)) {
        duplicateCount++;
        continue;
      }
      seenExternalIds.add(row.external_id);

      // Handle parse errors
      if (!row.parse_success) {
        errorCount++;
        reviewItems.push({
          review_type: 'catalog',
          priority: row.validation_issues.length > 2 ? 'medium' : 'low',
          source_table: 'import_batches',
          source_id: batchId,
          title: `Parse error in row ${row.index + 1}`,
          issue_category: 'parse_error',
          issue_summary: row.parse_error || 'Unknown parse error',
          recommended_action: 'FIX SOURCE DATA or skip row',
          agent_name: 'product_intake',
          details: { 
            row_index: row.index,
            external_id: row.external_id,
            raw_data: row.raw_data,
            validation_issues: row.validation_issues,
            batch_id: batchId,
          },
        });
        continue;
      }

      // Persist raw row (immutable)
      const rawId = crypto.randomUUID();
      const { error: rawError } = await supabaseAdmin
        .from('supplier_products_raw')
        .upsert({
          id: rawId,
          batch_id: batchId,
          supplier_id: input.supplier_id,
          external_id: row.external_id,
          raw_payload: row.raw_data,
          checksum: row.checksum,
          created_at: new Date().toISOString(),
        }, { onConflict: 'batch_id,supplier_id,external_id' });

      if (rawError) {
        logger.warn('Failed to persist raw row', { 
          error: rawError.message,
          external_id: row.external_id,
        });
        errorCount++;
        continue;
      }

      // Persist normalized staging row
      const normalizedId = crypto.randomUUID();
      const { error: normError } = await supabaseAdmin
        .from('supplier_products_normalized')
        .insert({
          id: normalizedId,
          batch_id: batchId,
          raw_id: rawId,
          supplier_id: input.supplier_id,
          normalized_data: row.raw_data,
          attributes: extractBasicAttributes(row.raw_data),
          status: 'pending',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (normError) {
        // Log but don't fail - raw row is persisted
        logger.warn('Failed to persist normalized row', { 
          error: normError.message,
          raw_id: rawId,
        });
      }

      successCount++;

      // Create normalization job for each successfully parsed row
      followupJobs.push({
        job_type: 'product_normalization',
        payload: {
          product_id: normalizedId,
          raw_id: rawId,
          raw_data: row.raw_data,
          supplier_id: input.supplier_id,
          batch_id: batchId,
          external_id: row.external_id,
        },
        dedupe_key: `product_normalization:${normalizedId}`,
        priority: 50,
      });
    }

    // =========================================================================
    // STEP 5: UPDATE BATCH STATUS
    // =========================================================================
    const finalStatus = errorCount === parsedRows.length ? 'failed' 
      : errorCount > 0 ? 'partial' 
      : 'completed';

    await supabaseAdmin
      .from('import_batches')
      .update({
        status: finalStatus,
        row_count: parsedRows.length,
        success_count: successCount,
        error_count: errorCount,
        completed_at: new Date().toISOString(),
      })
      .eq('id', batchId);

    // =========================================================================
    // STEP 6: EMIT COMPLETION EVENT
    // =========================================================================
    await emitSystemEvent({
      event_type: 'supplier_ingestion_completed',
      source_table: 'import_batches',
      source_id: batchId,
      payload: {
        supplier_id: input.supplier_id,
        batch_id: batchId,
        file_id: input.file_id,
        format,
        total_rows: parsedRows.length,
        success_count: successCount,
        error_count: errorCount,
        duplicate_count: duplicateCount,
        review_items_created: reviewItems.length,
        normalization_jobs_created: followupJobs.length,
      },
    });

    // =========================================================================
    // STEP 7: PERSIST REVIEW ITEMS
    // =========================================================================
    for (const item of reviewItems) {
      await createReviewItem(item);
    }

    // =========================================================================
    // RETURN RESULT
    // =========================================================================
    return {
      success: successCount > 0 || parsedRows.length === 0,
      output: {
        batch_id: batchId,
        file_metadata: fileMetadata,
        format,
        total_rows: parsedRows.length,
        parsed_successfully: successCount,
        parse_errors: errorCount,
        duplicates_skipped: duplicateCount,
        review_items_created: reviewItems.length,
        normalization_jobs_created: followupJobs.length,
        status: finalStatus,
      },
      reviewItems,
      followupJobs,
    };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error('Supplier ingestion failed', { error: message });
    return {
      success: false,
      error: message,
    };
  }
}

// ============================================================================
// PARSING FUNCTIONS
// ============================================================================

function detectFormat(filename: string, content: string | Buffer): 'csv' | 'xlsx' | 'json' {
  const ext = filename.toLowerCase().split('.').pop();
  
  if (ext === 'xlsx' || ext === 'xls') {
    return 'xlsx';
  }
  if (ext === 'json') {
    return 'json';
  }
  if (ext === 'csv' || ext === 'tsv') {
    return 'csv';
  }

  // Try to detect from content
  const contentStr = typeof content === 'string' ? content : content.toString();
  const trimmed = contentStr.trim();
  
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return 'json';
  }
  
  return 'csv'; // Default fallback
}

async function parseFile(
  content: string | Buffer,
  format: 'csv' | 'xlsx' | 'json',
  columnMapping?: Record<string, string>
): Promise<ParsedRow[]> {
  switch (format) {
    case 'csv':
      return parseCSV(content.toString(), columnMapping);
    case 'json':
      return parseJSON(content.toString(), columnMapping);
    case 'xlsx':
      return parseXLSX(content, columnMapping);
    default:
      throw new Error(`Unsupported format: ${format}`);
  }
}

function parseCSV(
  content: string,
  columnMapping?: Record<string, string>
): ParsedRow[] {
  const rows: ParsedRow[] = [];
  const lines = content.split(/\r?\n/).filter(line => line.trim());
  
  if (lines.length === 0) {
    return [];
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);
  
  // Apply column mapping if provided
  const mappedHeaders = headers.map(h => {
    const normalized = h.toLowerCase().trim();
    return columnMapping?.[normalized] || columnMapping?.[h] || h;
  });

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    try {
      const values = parseCSVLine(line);
      const rawData: Record<string, unknown> = {};
      
      for (let j = 0; j < mappedHeaders.length; j++) {
        const header = mappedHeaders[j];
        const value = values[j] ?? '';
        rawData[header] = parseValue(value);
      }

      // Generate external_id from key fields or row index
      const externalId = generateExternalId(rawData, i);
      const checksum = generateChecksum(rawData);
      const validation = validateRow(rawData);

      rows.push({
        index: i - 1,
        external_id: externalId,
        raw_data: rawData,
        checksum,
        parse_success: validation.issues.length === 0,
        parse_error: validation.issues.length > 0 ? validation.issues.join('; ') : undefined,
        validation_issues: validation.issues,
      });
    } catch (error) {
      rows.push({
        index: i - 1,
        external_id: `row_${i}`,
        raw_data: { _raw_line: line },
        checksum: '',
        parse_success: false,
        parse_error: error instanceof Error ? error.message : 'Parse error',
        validation_issues: ['Failed to parse CSV line'],
      });
    }
  }

  return rows;
}

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];
    
    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        current += '"';
        i++; // Skip the escaped quote
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
  }
  
  result.push(current.trim());
  return result;
}

function parseJSON(
  content: string,
  columnMapping?: Record<string, string>
): ParsedRow[] {
  const parsed = JSON.parse(content);
  const items = Array.isArray(parsed) ? parsed : parsed.products || parsed.items || parsed.data || [parsed];
  
  return items.map((item: Record<string, unknown>, index: number) => {
    // Apply column mapping
    const rawData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(item)) {
      const mappedKey = columnMapping?.[key.toLowerCase()] || columnMapping?.[key] || key;
      rawData[mappedKey] = value;
    }

    const externalId = generateExternalId(rawData, index);
    const checksum = generateChecksum(rawData);
    const validation = validateRow(rawData);

    return {
      index,
      external_id: externalId,
      raw_data: rawData,
      checksum,
      parse_success: validation.issues.length === 0,
      parse_error: validation.issues.length > 0 ? validation.issues.join('; ') : undefined,
      validation_issues: validation.issues,
    };
  });
}

function parseXLSX(
  content: string | Buffer,
  columnMapping?: Record<string, string>
): ParsedRow[] {
  // For XLSX parsing, we need the xlsx library
  // In production, this would use: import * as XLSX from 'xlsx';
  // For now, we'll handle it by requiring the library dynamically
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const XLSX = require('xlsx');
    
    const workbook = XLSX.read(content, { type: typeof content === 'string' ? 'string' : 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet);

    return (jsonData as Record<string, unknown>[]).map((item, index) => {
      const rawData: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(item)) {
        const mappedKey = columnMapping?.[key.toLowerCase()] || columnMapping?.[key] || key;
        rawData[mappedKey] = value;
      }

      const externalId = generateExternalId(rawData, index);
      const checksum = generateChecksum(rawData);
      const validation = validateRow(rawData);

      return {
        index,
        external_id: externalId,
        raw_data: rawData,
        checksum,
        parse_success: validation.issues.length === 0,
        parse_error: validation.issues.length > 0 ? validation.issues.join('; ') : undefined,
        validation_issues: validation.issues,
      };
    });
  } catch (error) {
    // If xlsx not available, throw helpful error
    throw new Error('XLSX parsing not available. Install xlsx package: npm install xlsx');
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function parseValue(value: string): unknown {
  if (value === '' || value === 'null' || value === 'NULL') {
    return null;
  }
  
  // Try number
  const num = Number(value);
  if (!isNaN(num) && value.trim() !== '') {
    return num;
  }
  
  // Try boolean
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  
  return value;
}

function generateExternalId(data: Record<string, unknown>, fallbackIndex: number): string {
  // Try common ID fields in priority order
  const idFields = ['sku', 'SKU', 'supplier_sku', 'product_id', 'external_id', 'id', 'part_number', 'mpn', 'upc'];
  
  for (const field of idFields) {
    if (data[field] && String(data[field]).trim()) {
      return String(data[field]).trim();
    }
  }
  
  return `row_${fallbackIndex + 1}`;
}

function generateChecksum(data: Record<string, unknown>): string {
  const sortedKeys = Object.keys(data).sort();
  const normalized = sortedKeys.map(k => `${k}:${JSON.stringify(data[k])}`).join('|');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

function validateRow(data: Record<string, unknown>): { issues: string[] } {
  const issues: string[] = [];
  
  // Check for completely empty row
  const hasAnyValue = Object.values(data).some(v => v !== null && v !== undefined && String(v).trim() !== '');
  if (!hasAnyValue) {
    issues.push('Empty row');
  }
  
  // Check for minimum required fields
  const hasIdentifier = Object.keys(data).some(k => 
    ['sku', 'product_id', 'external_id', 'id', 'part_number', 'mpn', 'upc'].includes(k.toLowerCase()) &&
    data[k] !== null && data[k] !== undefined && String(data[k]).trim() !== ''
  );
  
  if (!hasIdentifier) {
    issues.push('Missing product identifier (sku, mpn, upc, or product_id)');
  }
  
  // Check for basic product info
  const hasProductInfo = Object.keys(data).some(k =>
    ['name', 'title', 'description', 'product_name'].includes(k.toLowerCase()) &&
    data[k] !== null && data[k] !== undefined
  );
  
  if (!hasProductInfo) {
    issues.push('Missing product name or description');
  }
  
  return { issues };
}

function extractBasicAttributes(data: Record<string, unknown>): Record<string, unknown> {
  const attributes: Record<string, unknown> = {};
  
  // Extract known attribute fields
  const attributeFields = [
    'brand', 'manufacturer', 'material', 'color', 'size', 'grade',
    'thickness', 'thickness_mil', 'units_per_box', 'boxes_per_case',
    'powder', 'texture', 'cuff_style', 'sterile', 'latex_free'
  ];
  
  for (const field of attributeFields) {
    if (data[field] !== undefined && data[field] !== null) {
      attributes[field] = data[field];
    }
  }
  
  return attributes;
}
