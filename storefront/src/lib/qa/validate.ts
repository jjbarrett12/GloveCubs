/**
 * QA Supervisor - Input Validation
 * 
 * Validates audit input before processing.
 */

import type { QAAuditInput, SupplierRecord, ProductRecord, MatchRecord, PricingRecord, ActionRecord } from './types';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validate audit input structure
 */
export function validateAuditInput(input: QAAuditInput): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!input.mode) {
    errors.push('Missing required field: mode');
  } else if (!['dry_run', 'apply_safe_fixes', 'review_only'].includes(input.mode)) {
    errors.push(`Invalid mode: ${input.mode}. Must be: dry_run, apply_safe_fixes, or review_only`);
  }

  if (!input.scope) {
    errors.push('Missing required field: scope');
  } else if (!['full', 'targeted'].includes(input.scope)) {
    errors.push(`Invalid scope: ${input.scope}. Must be: full or targeted`);
  }

  // Targeted scope requires modules or data
  if (input.scope === 'targeted') {
    const hasModules = input.modules && input.modules.length > 0;
    const hasData = (input.suppliers?.length ?? 0) > 0 ||
                   (input.products?.length ?? 0) > 0 ||
                   (input.matches?.length ?? 0) > 0 ||
                   (input.pricing?.length ?? 0) > 0 ||
                   (input.actions?.length ?? 0) > 0;

    if (!hasModules && !hasData) {
      errors.push('Targeted audit requires either modules or data arrays');
    }
  }

  // Validate data arrays if provided
  if (input.suppliers) {
    const supplierErrors = validateSuppliers(input.suppliers);
    errors.push(...supplierErrors.map(e => `suppliers: ${e}`));
  }

  if (input.products) {
    const productErrors = validateProducts(input.products);
    errors.push(...productErrors.map(e => `products: ${e}`));
  }

  if (input.matches) {
    const matchErrors = validateMatches(input.matches);
    errors.push(...matchErrors.map(e => `matches: ${e}`));
  }

  if (input.pricing) {
    const pricingErrors = validatePricing(input.pricing);
    errors.push(...pricingErrors.map(e => `pricing: ${e}`));
  }

  // Warnings for potential issues
  if (input.mode === 'apply_safe_fixes') {
    warnings.push('apply_safe_fixes mode will mark fixes as applied but does NOT write to source tables');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateSuppliers(suppliers: SupplierRecord[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < suppliers.length; i++) {
    const s = suppliers[i];
    if (!s.id && !s.name) {
      errors.push(`[${i}] Missing both id and name`);
    }
  }

  return errors;
}

function validateProducts(products: ProductRecord[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    if (!p.id && !p.sku && !p.supplier_sku) {
      errors.push(`[${i}] Missing id, sku, and supplier_sku`);
    }
  }

  return errors;
}

function validateMatches(matches: MatchRecord[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    if (!m.incoming_supplier_product_id) {
      errors.push(`[${i}] Missing incoming_supplier_product_id`);
    }
    if (m.match_confidence === undefined) {
      errors.push(`[${i}] Missing match_confidence`);
    }
  }

  return errors;
}

function validatePricing(pricing: PricingRecord[]): string[] {
  const errors: string[] = [];
  
  for (let i = 0; i < pricing.length; i++) {
    const p = pricing[i];
    if (!p.canonical_product_id) {
      errors.push(`[${i}] Missing canonical_product_id`);
    }
  }

  return errors;
}

/**
 * Generate a stable dedupe key for a fix
 */
export function generateFixDedupeKey(
  module: string,
  recordType: string,
  recordId: string,
  issueFound: string
): string {
  const normalized = issueFound.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
  return `${module}:${recordType}:${recordId}:${normalized}`;
}

/**
 * Generate a stable dedupe key for a review item
 */
export function generateReviewDedupeKey(
  module: string,
  recordType: string,
  recordId: string,
  issueCategory: string
): string {
  return `${module}:${recordType}:${recordId}:${issueCategory}`;
}

/**
 * Generate a stable dedupe key for a blocked action
 */
export function generateBlockedDedupeKey(
  module: string,
  recordType: string,
  recordId: string,
  reason: string
): string {
  const normalizedReason = reason.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 50);
  return `${module}:${recordType}:${recordId}:${normalizedReason}`;
}
