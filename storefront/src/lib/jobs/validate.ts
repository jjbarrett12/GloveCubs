/**
 * Job Payload Validation
 * 
 * Runtime validation for job payloads
 */

import { logger } from './logger';
import type { JobType } from '../agents/types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a UUID string
 */
export function isValidUUID(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate payload for a specific job type
 */
export function validateJobPayload(
  jobType: JobType,
  payload: Record<string, unknown>
): ValidationResult {
  const errors: string[] = [];

  switch (jobType) {
    case 'supplier_discovery':
      // Optional fields only
      if (payload.max_results !== undefined) {
        if (typeof payload.max_results !== 'number' || payload.max_results < 1) {
          errors.push('max_results must be a positive number');
        }
      }
      break;

    case 'supplier_ingestion':
      if (!payload.file_id && !payload.file_url && !payload.supplier_id) {
        errors.push('Must provide file_id, file_url, or supplier_id');
      }
      if (payload.format && !['csv', 'json', 'xlsx'].includes(payload.format as string)) {
        errors.push('format must be csv, json, or xlsx');
      }
      break;

    case 'product_normalization':
      // Allow batch_ids or single product_id
      if (!payload.product_id && !payload.batch_ids) {
        if (!payload.raw_data) {
          errors.push('Must provide product_id, batch_ids, or raw_data');
        }
      }
      break;

    case 'product_match':
      if (!payload.normalized_product_id && !payload.normalized_data) {
        errors.push('Must provide normalized_product_id or normalized_data');
      }
      break;

    case 'competitor_price_check':
      if (!payload.product_ids && !payload.sku_list) {
        errors.push('Must provide product_ids or sku_list');
      }
      if (payload.product_ids && !Array.isArray(payload.product_ids)) {
        errors.push('product_ids must be an array');
      }
      break;

    case 'pricing_recommendation':
      if (!payload.product_id) {
        errors.push('product_id is required');
      }
      break;

    case 'daily_price_guard':
      // All fields optional
      break;

    case 'audit_run':
      // All fields optional
      break;

    case 'system_event_processor':
      if (payload.batch_size !== undefined) {
        if (typeof payload.batch_size !== 'number' || payload.batch_size < 1) {
          errors.push('batch_size must be a positive number');
        }
      }
      break;

    default:
      logger.warn('Unknown job type for validation', { job_type: jobType });
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Validate and sanitize payload, removing unexpected fields
 */
export function sanitizePayload(
  jobType: JobType,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const allowedFields: Record<JobType, string[]> = {
    supplier_discovery: ['search_terms', 'categories', 'max_results'],
    supplier_ingestion: ['file_id', 'file_url', 'supplier_id', 'format'],
    product_normalization: ['product_id', 'raw_data', 'supplier_id', 'batch_ids'],
    product_match: ['normalized_product_id', 'normalized_data', 'catalog_scope'],
    competitor_price_check: ['product_ids', 'sku_list', 'priority_tier'],
    pricing_recommendation: ['product_id', 'current_price', 'current_cost', 'competitor_offers', 'trigger_reason'],
    daily_price_guard: ['include_long_tail', 'product_ids', 'run_date'],
    audit_run: ['modules', 'full_audit', 'since'],
    review_queue_builder: ['batch_size'],
    system_event_processor: ['event_ids', 'event_types', 'batch_size'],
  };

  const allowed = allowedFields[jobType] || [];
  const sanitized: Record<string, unknown> = {};

  for (const key of allowed) {
    if (key in payload) {
      sanitized[key] = payload[key];
    }
  }

  // Always allow internal trigger metadata
  if (payload._triggered_by) {
    sanitized._triggered_by = payload._triggered_by;
  }

  return sanitized;
}
