/**
 * Handler Unit Tests
 * 
 * Basic tests for handler input validation and error handling.
 * These tests verify the handlers correctly validate inputs without
 * requiring complex database mocks.
 */

import { describe, it, expect, vi } from 'vitest';

// Mock all dependencies before importing handlers
vi.mock('../../jobs/supabase', () => {
  const mockChain = {
    select: vi.fn(() => mockChain),
    insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    upsert: vi.fn(() => Promise.resolve({ data: null, error: null })),
    update: vi.fn(() => mockChain),
    eq: vi.fn(() => mockChain),
    single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    in: vi.fn(() => mockChain),
    gte: vi.fn(() => mockChain),
    not: vi.fn(() => mockChain),
    or: vi.fn(() => mockChain),
    order: vi.fn(() => mockChain),
    limit: vi.fn(() => Promise.resolve({ data: [], error: null })),
  };

  return {
    supabaseAdmin: {
      from: vi.fn(() => mockChain),
      storage: {
        from: vi.fn(() => ({
          download: vi.fn(() => Promise.resolve({ data: null, error: { message: 'Not found' } })),
        })),
      },
    },
  };
});

vi.mock('../../jobs/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../../agents/config', () => ({
  getAgentRule: vi.fn(() => Promise.resolve(0.7)),
}));

vi.mock('../../events/emit', () => ({
  emitSystemEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock('../../review/createReviewItem', () => ({
  createReviewItem: vi.fn(() => Promise.resolve(true)),
}));

vi.mock('../../qa', () => ({
  runQAAudit: vi.fn(() => Promise.resolve({
    run_id: 'test-id',
    status: 'completed',
    mode: 'dry_run',
    scope: 'full',
    run_type: 'dry_run',
    summary: { records_audited: 0, issues_found: 0, safe_auto_fixes_applied: 0, items_sent_to_review: 0, items_blocked: 0 },
    module_results: [],
    fixes: [],
    review_items: [],
    blocked_actions: [],
    systemic_issues: [],
    next_steps: [],
    self_audit: { passed: true, validation_notes: [] },
    persisted: { audit_report_id: null, fix_logs_created: 0, blocked_actions_created: 0, review_items_created: 0 },
  })),
}));

vi.mock('../../qa/triggers', () => ({
  qaAfterNormalization: vi.fn(() => Promise.resolve({ issues: [], fixes: [] })),
  qaAfterMatching: vi.fn(() => Promise.resolve({ issues: [], fixes: [] })),
  qaAfterPricing: vi.fn(() => Promise.resolve({ issues: [], fixes: [] })),
}));

// Import handlers after mocks
import { handleSupplierIngestion } from '../handlers/supplierIngestion';
import { handleAuditRun } from '../handlers/auditRun';

describe('Handler Input Validation', () => {
  describe('Supplier Ingestion', () => {
    it('should reject missing supplier_id', async () => {
      const result = await handleSupplierIngestion({
        file_content: 'sku,name\nTEST,Test Product',
        format: 'csv',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('supplier_id');
    });

    it('should reject missing file source', async () => {
      const result = await handleSupplierIngestion({
        supplier_id: 'test-supplier',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('file_id');
    });

    it('should parse valid CSV content', async () => {
      const csvContent = `sku,name,brand,material
TEST-001,Test Gloves,TestBrand,nitrile`;

      const result = await handleSupplierIngestion({
        supplier_id: 'test-supplier',
        file_content: csvContent,
        format: 'csv',
      });

      // Even with mock DB that returns null, parsing should work
      expect(result.output).toBeDefined();
      expect(result.output?.format).toBe('csv');
      expect(result.output?.total_rows).toBe(1);
    });

    it('should handle empty CSV', async () => {
      const result = await handleSupplierIngestion({
        supplier_id: 'test-supplier',
        file_content: 'sku,name',
        format: 'csv',
      });

      expect(result.output?.total_rows).toBe(0);
    });

    it('should generate followup jobs for parsed rows', async () => {
      const csvContent = `sku,name,brand
ROW-001,Product One,Brand
ROW-002,Product Two,Brand`;

      const result = await handleSupplierIngestion({
        supplier_id: 'test-supplier',
        file_content: csvContent,
        format: 'csv',
      });

      expect(result.followupJobs).toBeDefined();
      expect(result.followupJobs?.length).toBe(2);
      expect(result.followupJobs?.[0].job_type).toBe('product_normalization');
    });
  });

  describe('Audit Run', () => {
    it('should support dry_run mode', async () => {
      const result = await handleAuditRun({
        full_audit: true,
        dry_run: true,
      });

      expect(result.success).toBe(true);
      expect(result.output?.mode).toBe('dry_run');
    });

    it('should support review_only mode', async () => {
      const result = await handleAuditRun({
        full_audit: true,
        review_only: true,
      });

      expect(result.success).toBe(true);
      // The handler determines mode from input flags
    });

    it('should return summary metrics', async () => {
      const result = await handleAuditRun({
        full_audit: true,
      });

      expect(result.output?.summary).toBeDefined();
      expect(typeof result.output?.summary?.records_audited).toBe('number');
    });
  });
});

describe('CSV Parsing', () => {
  it('should handle quoted fields', async () => {
    const csvContent = `sku,name,description
Q-001,"Test Product","This is a ""quoted"" description"`;

    const result = await handleSupplierIngestion({
      supplier_id: 'test',
      file_content: csvContent,
      format: 'csv',
    });

    expect(result.output?.total_rows).toBe(1);
    expect(result.output?.parsed_successfully).toBeGreaterThanOrEqual(0);
  });

  it('should handle fields with commas', async () => {
    const csvContent = `sku,name,sizes
C-001,"Test Product","Small, Medium, Large"`;

    const result = await handleSupplierIngestion({
      supplier_id: 'test',
      file_content: csvContent,
      format: 'csv',
    });

    expect(result.output?.total_rows).toBe(1);
  });

  it('should detect missing identifiers', async () => {
    const csvContent = `name,description
No SKU Product,Description`;

    const result = await handleSupplierIngestion({
      supplier_id: 'test',
      file_content: csvContent,
      format: 'csv',
    });

    // Should create review items for rows missing identifiers
    expect(result.reviewItems?.length).toBeGreaterThan(0);
  });
});

describe('JSON Parsing', () => {
  it('should handle array of products', async () => {
    const jsonContent = JSON.stringify([
      { sku: 'J-001', name: 'Product 1' },
      { sku: 'J-002', name: 'Product 2' },
    ]);

    const result = await handleSupplierIngestion({
      supplier_id: 'test',
      file_content: jsonContent,
      format: 'json',
    });

    expect(result.output?.total_rows).toBe(2);
  });

  it('should handle nested products key', async () => {
    const jsonContent = JSON.stringify({
      products: [
        { sku: 'N-001', name: 'Nested Product' },
      ],
    });

    const result = await handleSupplierIngestion({
      supplier_id: 'test',
      file_content: jsonContent,
      format: 'json',
    });

    expect(result.output?.total_rows).toBe(1);
  });
});
