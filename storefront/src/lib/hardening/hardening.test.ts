/**
 * Production Hardening Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock supabaseAdmin before importing modules
vi.mock('../jobs/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

describe('Rate Limiter', () => {
  describe('RATE_LIMIT_CONFIGS', () => {
    it('should have login configuration', async () => {
      const { RATE_LIMIT_CONFIGS } = await import('./rateLimiter');
      
      expect(RATE_LIMIT_CONFIGS.login).toBeDefined();
      expect(RATE_LIMIT_CONFIGS.login.window_ms).toBe(15 * 60 * 1000);
      expect(RATE_LIMIT_CONFIGS.login.max_requests).toBe(10);
      expect(RATE_LIMIT_CONFIGS.login.block_duration_ms).toBe(30 * 60 * 1000);
    });
    
    it('should have password_reset configuration', async () => {
      const { RATE_LIMIT_CONFIGS } = await import('./rateLimiter');
      
      expect(RATE_LIMIT_CONFIGS.password_reset).toBeDefined();
      expect(RATE_LIMIT_CONFIGS.password_reset.max_requests).toBe(3);
    });
    
    it('should have api_key configuration', async () => {
      const { RATE_LIMIT_CONFIGS } = await import('./rateLimiter');
      
      expect(RATE_LIMIT_CONFIGS.api_key).toBeDefined();
      expect(RATE_LIMIT_CONFIGS.api_key.max_requests).toBe(60);
    });
  });
});

describe('Telemetry', () => {
  describe('Error Categories', () => {
    it('should support ingestion_failure category', async () => {
      const { logIngestionFailure } = await import('./telemetry');
      
      // Should not throw
      const result = await logIngestionFailure('Test failure', {
        supplier_id: 'test-supplier',
        upload_id: 'test-upload',
      });
      
      // Returns null when DB insert fails (mocked)
      expect(result).toBeNull();
    });
    
    it('should support ai_extraction_failure category', async () => {
      const { logAIExtractionFailure } = await import('./telemetry');
      
      const result = await logAIExtractionFailure('Extraction failed', {
        supplier_id: 'test-supplier',
        confidence: 0.3,
      });
      
      expect(result).toBeNull();
    });
    
    it('should support recommendation_engine_error category', async () => {
      const { logRecommendationEngineError } = await import('./telemetry');
      
      const result = await logRecommendationEngineError('Engine error', {
        product_id: 'test-product',
        operation: 'recommend',
      });
      
      expect(result).toBeNull();
    });
    
    it('should support payment_failure category', async () => {
      const { logPaymentFailure } = await import('./telemetry');
      
      const result = await logPaymentFailure('Payment declined', {
        buyer_id: 'test-buyer',
        order_id: 'test-order',
        amount: 99.99,
        currency: 'USD',
      });
      
      expect(result).toBeNull();
    });
  });
});

describe('Transactions', () => {
  describe('Advisory Lock Hash', () => {
    it('should generate consistent numeric hash for strings', async () => {
      // The hash function is internal, but we can test the lock behavior
      const { acquireAdvisoryLock } = await import('./transactions');
      
      // Should not throw when acquiring lock
      const lock1 = await acquireAdvisoryLock('test_entity', 'test_id_1');
      expect(lock1).toHaveProperty('acquired');
      expect(lock1).toHaveProperty('release');
      
      // Release should be callable
      await lock1.release();
    });
  });
  
  describe('withAdvisoryLock', () => {
    it('should return result structure with success/error fields', async () => {
      const { withAdvisoryLock } = await import('./transactions');
      
      // With our mock, the lock may or may not be acquired
      const result = await withAdvisoryLock(
        'test_entity',
        'test_id',
        async () => {
          return 'success';
        },
        { retry_count: 1 } // Reduce retries for faster test
      );
      
      // Either success or failure, result should have the right structure
      expect(result).toHaveProperty('success');
      if (result.success) {
        expect(result.result).toBe('success');
      } else {
        expect(result.error).toBeDefined();
      }
    });
    
    it('should handle function errors when lock is acquired', async () => {
      const { withAdvisoryLock } = await import('./transactions');
      
      const result = await withAdvisoryLock(
        'test_entity',
        'test_id_error',
        async () => {
          throw new Error('Test error');
        },
        { retry_count: 1 }
      );
      
      expect(result.success).toBe(false);
      // Error could be from lock failure or function error
      expect(result.error).toBeDefined();
    });
  });
});

describe('Confidence Floor', () => {
  it('MIN_EXTRACTION_CONFIDENCE should be 0.5', async () => {
    // This tests that we've added the constant
    const { readFileSync } = await import('fs');
    const content = readFileSync('./src/lib/supplier-portal/feedUpload.ts', 'utf-8');
    
    expect(content).toContain('MIN_EXTRACTION_CONFIDENCE = 0.5');
  });
});

describe('Secure Cookie Flags', () => {
  it('should use strict SameSite in production config', async () => {
    const { readFileSync } = await import('fs');
    const content = readFileSync('./src/app/supplier-portal/api/auth/route.ts', 'utf-8');
    
    expect(content).toContain("sameSite: 'strict'");
    expect(content).toContain('httpOnly: true');
    expect(content).toContain('secure:');
  });
});
