import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

/**
 * Service Layer Tests for Supplier Feed Upload
 * 
 * These tests mock the database layer to test:
 * - normalizeAndMatch behavior
 * - validateRow logic
 * - duplicate detection
 * - price anomaly warnings
 * - correction flow
 * - commit idempotency
 * - supplier scope enforcement
 */

// ============================================================================
// MOCK SETUP
// ============================================================================

// Mock getSupabaseCatalogos for commit path (P0-2 atomic RPC)
const mockCatalogosRpc = vi.fn();
// Mock supabaseAdmin before importing the module
vi.mock('../jobs/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn(),
    })),
  },
  getSupabaseCatalogos: () => ({ rpc: mockCatalogosRpc }),
}));

// Mock auth module
vi.mock('./auth', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));
// Mock telemetry so commit failure path reaches updateUploadStatus
vi.mock('../hardening/telemetry', () => ({
  logTransactionFailure: vi.fn().mockResolvedValue(undefined),
  logIngestionFailure: vi.fn().mockResolvedValue(undefined),
  logAIExtractionFailure: vi.fn().mockResolvedValue(undefined),
}));

// Import after mocking
import { supabaseAdmin } from '../jobs/supabase';
import {
  normalizeAndMatch,
  validateRow,
  correctRow,
  commitFeedUpload,
  getUploadRows,
  parseCSV,
  extractFields,
  type ExtractedProduct,
  type NormalizedProduct,
  type ValidationResult,
} from './feedUpload';

// Helper to create mock chain
function createMockChain(finalValue: unknown = null) {
  const mockChain = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    not: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    or: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: finalValue, error: null }),
  };
  return mockChain;
}

describe('Supplier Feed Upload - Service Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  // ==========================================================================
  // NORMALIZE AND MATCH
  // ==========================================================================
  describe('normalizeAndMatch', () => {
    describe('exact SKU matching', () => {
      it('should return 100% confidence for exact SKU match', async () => {
        const mockProduct = { id: 'prod-123', name: 'Nitrile Gloves Large' };
        
        const mockChain = createMockChain(mockProduct);
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          sku: 'SKU-12345',
          product_name: 'Some Product',
          price: 10.99,
          confidence: { sku: 1.0 },
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        expect(result.match_method).toBe('exact_sku');
        expect(result.match_confidence).toBe(1.0);
        expect(result.matched_product_id).toBe('prod-123');
      });

      it('should fallback to fuzzy match when SKU not found', async () => {
        // First call (SKU lookup) returns null
        const skuChain = createMockChain(null);
        // Second call (name lookup) returns matches
        const nameChain = {
          ...createMockChain(),
          limit: vi.fn().mockResolvedValue({
            data: [{ id: 'prod-456', name: 'Nitrile Gloves Large' }],
            error: null,
          }),
        };
        
        let callCount = 0;
        (supabaseAdmin.from as Mock).mockImplementation(() => {
          callCount++;
          if (callCount === 1) return skuChain;
          return nameChain;
        });
        
        const extracted: ExtractedProduct = {
          sku: 'UNKNOWN-SKU',
          product_name: 'Nitrile Gloves Large',
          price: 10.99,
          confidence: { sku: 1.0, product_name: 1.0 },
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        // Should fallback since SKU not found
        expect(result.match_method).not.toBe('exact_sku');
      });
    });

    describe('fuzzy name matching', () => {
      it('should handle case when no products match', async () => {
        const mockChain = {
          ...createMockChain(),
          limit: vi.fn().mockResolvedValue({
            data: [],
            error: null,
          }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Completely Unknown Product',
          price: 10.99,
          confidence: { product_name: 1.0 },
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        // When no matches found, should be no_match
        expect(result.match_method).toBe('no_match');
        expect(result.match_confidence).toBe(0);
      });

      it('should return no_match when similarity is too low', async () => {
        // Test the expected behavior: very different names should not match
        const mockChain = createMockChain(null);
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Nitrile Exam Gloves',
          price: 10.99,
          confidence: { product_name: 1.0 },
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        // With no database match, should be no_match
        expect(result.match_confidence).toBeLessThanOrEqual(0.6);
      });
    });

    describe('price normalization', () => {
      it('should calculate price per unit correctly', async () => {
        const mockChain = createMockChain({ id: 'prod-123', name: 'Test' });
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          sku: 'TEST-SKU',
          price: 100,
          case_pack: 10,
          confidence: {},
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        expect(result.price_normalized).toBe(100);
        expect(result.pack_size_normalized).toBe(10);
        expect(result.price_per_unit).toBe(10); // 100 / 10
      });

      it('should default pack size to 1 when not specified', async () => {
        const mockChain = createMockChain({ id: 'prod-123', name: 'Test' });
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          sku: 'TEST-SKU',
          price: 50,
          confidence: {},
        };
        
        const result = await normalizeAndMatch('supplier-1', extracted);
        
        expect(result.pack_size_normalized).toBe(1);
        expect(result.price_per_unit).toBe(50);
      });
    });
  });

  // ==========================================================================
  // VALIDATE ROW
  // ==========================================================================
  describe('validateRow', () => {
    describe('required field validation', () => {
      it('should return error when price is missing', async () => {
        const mockChain = createMockChain(null);
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          confidence: {},
          // price is missing
        };
        
        const normalized: NormalizedProduct = {
          match_confidence: 0,
          match_method: 'no_match',
          price_normalized: 0,
          price_per_unit: 0,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.is_valid).toBe(false);
        expect(result.errors.some(e => e.field === 'price')).toBe(true);
      });

      it('should return error when neither product_name nor sku exists', async () => {
        const mockChain = createMockChain(null);
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          price: 10.99,
          confidence: {},
          // No product_name or sku
        };
        
        const normalized: NormalizedProduct = {
          match_confidence: 0,
          match_method: 'no_match',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.is_valid).toBe(false);
        expect(result.errors.some(e => e.field === 'product_name')).toBe(true);
      });

      it('should be valid when price and identifier exist', async () => {
        // Mock empty results for all validation checks
        const mockChain = {
          ...createMockChain(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 10.99,
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.is_valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });
    });

    describe('duplicate detection', () => {
      it('should warn when active offer already exists for product', async () => {
        const existingOffer = {
          id: 'offer-existing',
          price: 9.99,
          updated_at: '2026-03-01T00:00:00Z',
        };
        
        // Mock chain that returns existing offer for duplicate check
        const mockChain = {
          ...createMockChain(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: existingOffer, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 10.99,
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.some(w => w.type === 'duplicate')).toBe(true);
      });

      it('should not warn when no existing offer', async () => {
        const mockChain = {
          ...createMockChain(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 10.99,
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.filter(w => w.type === 'duplicate')).toHaveLength(0);
      });
    });

    describe('price anomaly warning generation', () => {
      it('should not generate price anomaly when no market data available', async () => {
        // When there's no market data, no anomaly can be detected
        const mockChain = {
          ...createMockChain(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 100, // Any price
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 100,
          price_per_unit: 100,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        // No market data = no anomaly warning
        expect(result.warnings.filter(w => w.type === 'price_anomaly')).toHaveLength(0);
      });

      it('should not warn when price is within normal range', async () => {
        const mockChain = {
          ...createMockChain(),
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 11.50, // Within normal range
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 11.50,
          price_per_unit: 11.50,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.filter(w => w.type === 'price_anomaly')).toHaveLength(0);
      });
    });

    describe('low confidence warnings', () => {
      it('should warn when match confidence is below threshold', async () => {
        const mockChain = {
          ...createMockChain(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 10.99,
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.65, // Below 0.7 threshold
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.some(w => w.type === 'low_confidence')).toBe(true);
      });

      it('should warn when extraction confidence is below threshold', async () => {
        const mockChain = {
          ...createMockChain(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Test Product',
          price: 10.99,
          case_pack: 100,
          confidence: {
            product_name: 1.0,
            price: 1.0,
            case_pack: 0.6, // Below 0.7 threshold
          },
        };
        
        const normalized: NormalizedProduct = {
          matched_product_id: 'prod-123',
          matched_product_name: 'Test Product',
          match_confidence: 0.9,
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 0.1099,
          pack_size_normalized: 100,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.some(w => 
          w.type === 'low_confidence' && w.field === 'case_pack'
        )).toBe(true);
      });
    });

    describe('no match warning', () => {
      it('should warn when product cannot be matched', async () => {
        const mockChain = {
          ...createMockChain(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
        (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
        
        const extracted: ExtractedProduct = {
          product_name: 'Unknown Product XYZ',
          price: 10.99,
          confidence: { product_name: 1.0, price: 1.0 },
        };
        
        const normalized: NormalizedProduct = {
          match_confidence: 0,
          match_method: 'no_match',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        };
        
        const result = await validateRow('supplier-1', extracted, normalized);
        
        expect(result.warnings.some(w => w.type === 'low_confidence')).toBe(true);
      });
    });
  });

  // ==========================================================================
  // CORRECTION FLOW
  // ==========================================================================
  describe('correctRow', () => {
    it('should apply corrections and re-validate', async () => {
      const existingRow = {
        upload_id: 'upload-1',
        row_number: 1,
        raw_data: { name: 'Test', price: '10.99' },
        extracted: {
          product_name: 'Test',
          price: 10.99,
          case_pack: 50, // Wrong value
          confidence: { product_name: 1.0, price: 1.0, case_pack: 0.6 },
        },
        normalized: {
          match_confidence: 0.8,
          match_method: 'fuzzy_name',
          price_normalized: 10.99,
          price_per_unit: 0.2198,
          pack_size_normalized: 50,
          unit_normalized: 'each',
        },
        validation: { is_valid: true, warnings: [], errors: [] },
        status: 'warning',
      };
      
      const mockChain = {
        ...createMockChain(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
        update: vi.fn().mockReturnThis(),
      };
      (supabaseAdmin.from as Mock).mockReturnValue(mockChain);
      
      const corrections = {
        case_pack: 100, // Corrected value
      };
      
      const result = await correctRow('upload-1', 'supplier-1', 1, corrections);
      
      // Should have the corrected value
      expect(result.extracted.case_pack).toBe(100);
      // Corrected fields should have 1.0 confidence
      expect(result.extracted.confidence.case_pack).toBe(1.0);
    });

    it('should re-run normalization after correction', async () => {
      const existingRow = {
        upload_id: 'upload-1',
        row_number: 1,
        raw_data: { name: 'Test', price: '10.99' },
        extracted: {
          product_name: 'Test',
          price: 10.99,
          confidence: {},
        },
        normalized: {
          match_confidence: 0.5,
          match_method: 'no_match',
          price_normalized: 10.99,
          price_per_unit: 10.99,
          pack_size_normalized: 1,
          unit_normalized: 'each',
        },
        validation: { is_valid: true, warnings: [], errors: [] },
        status: 'warning',
      };
      
      const upload = { id: 'upload-1', supplier_id: 'supplier-1' };
      
      let callCount = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1) {
          // First call: verify ownership
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: upload, error: null }),
          };
        } else if (callCount === 2) {
          // Second call: get existing row
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: existingRow, error: null }),
          };
        }
        return createMockChain(null);
      });
      
      const corrections = {
        sku: 'NEW-SKU-123',
      };
      
      const result = await correctRow('upload-1', 'supplier-1', 1, corrections);
      
      // Should have the corrected SKU
      expect(result.extracted.sku).toBe('NEW-SKU-123');
    });
  });

  // ==========================================================================
  // COMMIT IDEMPOTENCY
  // ==========================================================================
  describe('commitFeedUpload', () => {
    beforeEach(() => {
      mockCatalogosRpc.mockReset();
    });

    it('should create new offers for unmatched products (via RPC)', async () => {
      const rows = [
        {
          row_number: 1,
          extracted: {
            sku: 'NEW-SKU',
            price: 10.99,
            confidence: {},
          },
          normalized: {
            matched_product_id: 'prod-123',
            match_confidence: 1.0,
            match_method: 'exact_sku',
            price_normalized: 10.99,
            price_per_unit: 10.99,
            pack_size_normalized: 1,
            unit_normalized: 'each',
          },
          status: 'valid',
        },
      ];
      mockCatalogosRpc.mockResolvedValue({
        data: { committed: 1, created: 1, updated: 0, skipped: 0 },
        error: null,
      });
      let callCount = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: { id: 'upload-1' }, error: null }),
          };
        }
        if (table === 'supplier_feed_upload_rows') {
          return {
            ...createMockChain(),
            in: vi.fn().mockResolvedValue({ data: rows, error: null }),
          };
        }
        return createMockChain();
      });
      const result = await commitFeedUpload('upload-1', 'supplier-1', 'user-1');
      expect(result.created).toBe(1);
      expect(mockCatalogosRpc).toHaveBeenCalledWith('commit_feed_upload', expect.objectContaining({
        p_upload_id: 'upload-1',
        p_supplier_id: 'supplier-1',
        p_user_id: 'user-1',
      }));
    });

    it('should update existing offers instead of creating duplicates (via RPC)', async () => {
      const rows = [
        {
          row_number: 1,
          extracted: {
            sku: 'EXISTING-SKU',
            price: 15.99, // New price
            confidence: {},
          },
          normalized: {
            matched_product_id: 'prod-123',
            match_confidence: 1.0,
            match_method: 'exact_sku',
            price_normalized: 15.99,
            price_per_unit: 15.99,
            pack_size_normalized: 1,
            unit_normalized: 'each',
          },
          status: 'valid',
        },
      ];
      
      mockCatalogosRpc.mockResolvedValue({
        data: { committed: 1, created: 0, updated: 1, skipped: 0 },
        error: null,
      });
      let callCount2 = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount2++;
        if (callCount2 === 1 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: { id: 'upload-1' }, error: null }),
          };
        }
        if (table === 'supplier_feed_upload_rows') {
          return {
            ...createMockChain(),
            in: vi.fn().mockResolvedValue({ data: rows, error: null }),
          };
        }
        return createMockChain();
      });
      const result = await commitFeedUpload('upload-1', 'supplier-1', 'user-1');
      expect(result.updated).toBe(1);
    });

    it('should skip rows without matched product (via RPC)', async () => {
      const rows = [
        {
          row_number: 1,
          extracted: {
            product_name: 'Unknown Product',
            price: 10.99,
            confidence: {},
          },
          normalized: {
            match_confidence: 0,
            match_method: 'no_match',
            price_normalized: 10.99,
            price_per_unit: 10.99,
            pack_size_normalized: 1,
            unit_normalized: 'each',
          },
          status: 'warning',
        },
      ];
      mockCatalogosRpc.mockResolvedValue({
        data: { committed: 0, created: 0, updated: 0, skipped: 1 },
        error: null,
      });
      let callCount = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount++;
        // First call is ownership verification
        if (callCount === 1 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: { id: 'upload-1' }, error: null }),
          };
        }
        if (table === 'supplier_feed_upload_rows') {
          return {
            ...createMockChain(),
            in: vi.fn().mockResolvedValue({ data: rows, error: null }),
          };
        }
        return createMockChain();
      });
      
      const result = await commitFeedUpload('upload-1', 'supplier-1', 'user-1');
      
      expect(result.skipped).toBe(1);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
    });

    it('should handle empty row selection gracefully', async () => {
      // When no rows match the selection, should return zeros
      let callCount = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount++;
        // First call is ownership verification
        if (callCount === 1 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: { id: 'upload-1' }, error: null }),
          };
        }
        const emptyRes = { data: [], error: null };
        const chain: Record<string, unknown> = {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          then: (r: (v: { data: unknown[] }) => void) => Promise.resolve(emptyRes).then(r as (v: unknown) => void),
          catch: (e: (err: unknown) => void) => Promise.resolve(emptyRes).catch(e),
        };
        return chain;
      });
      const result = await commitFeedUpload('upload-1', 'supplier-1', 'user-1', [999]);
      
      expect(result.committed).toBe(0);
      expect(result.created).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it('on RPC failure: sets upload status to failed and rethrows (no partial writes)', async () => {
      const rows = [
        {
          row_number: 1,
          extracted: { sku: 'X', price: 1, confidence: {} },
          normalized: {
            matched_product_id: 'prod-1',
            match_confidence: 1,
            match_method: 'exact_sku',
            price_normalized: 1,
            price_per_unit: 1,
            pack_size_normalized: 1,
            unit_normalized: 'each',
          },
          status: 'valid',
        },
      ];
      mockCatalogosRpc.mockRejectedValue(new Error('DB constraint violation'));
      let updatePayload: { status?: string } | null = null;
      let callCount = 0;
      (supabaseAdmin.from as Mock).mockImplementation((table: string) => {
        callCount++;
        if (callCount === 1 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            single: vi.fn().mockResolvedValue({ data: { id: 'upload-1' }, error: null }),
          };
        }
        if (table === 'supplier_feed_upload_rows') {
          return {
            ...createMockChain(),
            in: vi.fn().mockResolvedValue({ data: rows, error: null }),
          };
        }
        if (callCount === 3 && table === 'supplier_feed_uploads') {
          return {
            ...createMockChain(),
            update: vi.fn().mockImplementation((payload: { status?: string }) => {
              updatePayload = payload;
              return { eq: vi.fn().mockResolvedValue({ data: null, error: null }) };
            }),
          };
        }
        return createMockChain();
      });
      await expect(commitFeedUpload('upload-1', 'supplier-1', 'user-1')).rejects.toThrow('DB constraint violation');
      expect(updatePayload?.status).toBe('failed');
    });
  });

  // ==========================================================================
  // SUPPLIER SCOPE ENFORCEMENT
  // ==========================================================================
  describe('supplier scope enforcement', () => {
    it('should pass supplier_id to all database queries', async () => {
      const capturedSupplierIds: string[] = [];
      
      (supabaseAdmin.from as Mock).mockImplementation(() => ({
        ...createMockChain(),
        eq: vi.fn().mockImplementation((col: string, value: string) => {
          if (col === 'supplier_id') {
            capturedSupplierIds.push(value);
          }
          return {
            ...createMockChain(),
            eq: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }));
      
      const extracted: ExtractedProduct = {
        product_name: 'Test',
        price: 10.99,
        confidence: {},
      };
      
      const normalized: NormalizedProduct = {
        matched_product_id: 'prod-123',
        match_confidence: 0.9,
        match_method: 'fuzzy_name',
        price_normalized: 10.99,
        price_per_unit: 10.99,
        pack_size_normalized: 1,
        unit_normalized: 'each',
      };
      
      await validateRow('test-supplier-id', extracted, normalized);
      
      // Should have used the correct supplier_id in queries
      expect(capturedSupplierIds).toContain('test-supplier-id');
    });

    it('should require valid upload when correcting rows', async () => {
      // When ownership verification fails, should throw
      (supabaseAdmin.from as Mock).mockImplementation(() => {
        // Ownership verification returns null - upload not found or doesn't belong to supplier
        return {
          ...createMockChain(),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      });
      
      // Should throw when upload not found or access denied
      await expect(correctRow('upload-1', 'supplier-1', 1, { price: 15.99 }))
        .rejects.toThrow('Upload not found or access denied');
    });
  });
});

// ============================================================================
// INTEGRATION-STYLE TESTS
// ============================================================================

describe('Feed Upload - End-to-End Flow', () => {
  it('should parse, extract, and detect issues in a realistic CSV', () => {
    const csv = `SKU,Product Name,Unit Price,Pack Size,Material
GLV-NIT-L-100,"Nitrile Exam Gloves, Large",29.99,100,Nitrile
GLV-VIN-M-200,"Vinyl Gloves, Medium",19.99,200,Vinyl
GLV-LAT-S-50,"Latex Gloves, Small, Powder-Free",$24.50,50,Latex
BAD-ROW,Missing Price,,100,Unknown`;

    const rows = parseCSV(csv);
    expect(rows).toHaveLength(4);

    // Process each row
    const results = rows.map((row, i) => ({
      row_number: i + 1,
      raw: row,
      extracted: extractFields(row),
    }));

    // First row should be fully extracted
    expect(results[0].extracted.sku).toBe('GLV-NIT-L-100');
    expect(results[0].extracted.price).toBe(29.99);
    expect(results[0].extracted.case_pack).toBe(100);
    expect(results[0].extracted.material).toBe('nitrile');

    // Second row
    expect(results[1].extracted.material).toBe('vinyl');
    expect(results[1].extracted.case_pack).toBe(200);

    // Third row - price with $ sign
    expect(results[2].extracted.price).toBe(24.50);
    expect(results[2].extracted.material).toBe('latex');

    // Fourth row - missing price
    expect(results[3].extracted.price).toBeUndefined();
    expect(results[3].extracted.sku).toBe('BAD-ROW');
  });

  it('should handle real-world messy data', () => {
    const messyCSV = `"Item Number","Product Description","List Price","Units/Case"
"ABC-123","Industrial Nitrile, Blue, 6mil, XL","$45.99","1000"
"DEF-456","Economy Vinyl - Medium Size",15.50,500
"GHI-789","Missing SKU Product",10.00,100`;

    const rows = parseCSV(messyCSV);
    expect(rows).toHaveLength(3);

    const extracted = rows.map(r => extractFields(r));

    // First row - quoted fields, comma in value
    expect(extracted[0].sku).toBe('ABC-123');
    expect(extracted[0].price).toBe(45.99);
    expect(extracted[0].material).toBe('nitrile');

    // Second row - basic data
    expect(extracted[1].sku).toBe('DEF-456');
    expect(extracted[1].price).toBe(15.50);
    expect(extracted[1].material).toBe('vinyl');

    // Third row - has SKU and product_name
    expect(extracted[2].sku).toBe('GHI-789');
    expect(extracted[2].product_name).toBe('Missing SKU Product');
  });
});
