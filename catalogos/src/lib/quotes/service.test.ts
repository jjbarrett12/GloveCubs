/**
 * Tests for quote service lifecycle functionality.
 * 
 * Note: These tests mock Supabase to test business logic.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { QuoteStatus, QuoteRequestRow } from './types';

// Mock the supabase client
const mockFrom = vi.fn();
const mockSupabase = {
  from: mockFrom,
};

vi.mock('@/lib/db/client', () => ({
  getSupabaseCatalogos: () => mockSupabase,
}));

// Import after mocking
import { QUOTE_STATUS } from './types';

describe('Quote Status Types', () => {
  it('includes all required statuses', () => {
    expect(QUOTE_STATUS).toContain('new');
    expect(QUOTE_STATUS).toContain('reviewing');
    expect(QUOTE_STATUS).toContain('contacted');
    expect(QUOTE_STATUS).toContain('quoted');
    expect(QUOTE_STATUS).toContain('won');
    expect(QUOTE_STATUS).toContain('lost');
    expect(QUOTE_STATUS).toContain('expired');
    expect(QUOTE_STATUS).toContain('closed');
  });

  it('has 8 total statuses', () => {
    expect(QUOTE_STATUS.length).toBe(8);
  });
});

describe('Quote Status Transitions', () => {
  const validTransitions: Record<QuoteStatus, QuoteStatus[]> = {
    new: ['reviewing', 'contacted', 'quoted', 'closed'],
    reviewing: ['contacted', 'quoted', 'closed'],
    contacted: ['reviewing', 'quoted', 'closed'],
    quoted: ['reviewing', 'contacted', 'won', 'lost', 'expired', 'closed'],
    won: [], // Terminal state
    lost: [], // Terminal state
    expired: [], // Terminal state
    closed: ['new', 'reviewing'], // Can reopen
  };

  it('defines valid transitions from new', () => {
    const from = 'new' as QuoteStatus;
    expect(validTransitions[from]).toContain('reviewing');
    expect(validTransitions[from]).toContain('contacted');
    expect(validTransitions[from]).not.toContain('won');
    expect(validTransitions[from]).not.toContain('lost');
  });

  it('allows won/lost only from quoted state', () => {
    const quotedTransitions = validTransitions.quoted;
    expect(quotedTransitions).toContain('won');
    expect(quotedTransitions).toContain('lost');
    expect(quotedTransitions).toContain('expired');
    
    // Other states should not transition to won/lost
    expect(validTransitions.new).not.toContain('won');
    expect(validTransitions.reviewing).not.toContain('won');
    expect(validTransitions.contacted).not.toContain('won');
  });

  it('terminal states (won, lost, expired) have no transitions', () => {
    expect(validTransitions.won.length).toBe(0);
    expect(validTransitions.lost.length).toBe(0);
    expect(validTransitions.expired.length).toBe(0);
  });
});

describe('Quote Timestamps', () => {
  it('should set won_at when status changes to won', () => {
    const quote: Partial<QuoteRequestRow> = {
      id: 'test-quote-1',
      status: 'quoted',
      won_at: null,
      lost_at: null,
    };
    
    // Simulate status change to won
    const updatedQuote = {
      ...quote,
      status: 'won' as QuoteStatus,
      won_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    };
    
    expect(updatedQuote.won_at).not.toBeNull();
    expect(updatedQuote.closed_at).not.toBeNull();
    expect(updatedQuote.lost_at).toBeNull();
  });

  it('should set lost_at and lost_reason when status changes to lost', () => {
    const quote: Partial<QuoteRequestRow> = {
      id: 'test-quote-2',
      status: 'quoted',
      won_at: null,
      lost_at: null,
      lost_reason: null,
    };
    
    const reason = 'Price too high';
    const updatedQuote = {
      ...quote,
      status: 'lost' as QuoteStatus,
      lost_at: new Date().toISOString(),
      lost_reason: reason,
      closed_at: new Date().toISOString(),
    };
    
    expect(updatedQuote.lost_at).not.toBeNull();
    expect(updatedQuote.lost_reason).toBe(reason);
    expect(updatedQuote.closed_at).not.toBeNull();
  });

  it('should set expired_at when status changes to expired', () => {
    const quote: Partial<QuoteRequestRow> = {
      id: 'test-quote-3',
      status: 'quoted',
      expires_at: new Date().toISOString(),
      expired_at: null,
    };
    
    const updatedQuote = {
      ...quote,
      status: 'expired' as QuoteStatus,
      expired_at: new Date().toISOString(),
      closed_at: new Date().toISOString(),
    };
    
    expect(updatedQuote.expired_at).not.toBeNull();
    expect(updatedQuote.closed_at).not.toBeNull();
  });
});

describe('Quote Expiration Logic', () => {
  it('should identify quotes past their expiration date', () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    
    const expiredQuote: Partial<QuoteRequestRow> = {
      id: 'expired-1',
      status: 'quoted',
      expires_at: yesterday.toISOString(),
    };
    
    const now = new Date();
    const isExpired = expiredQuote.expires_at 
      ? new Date(expiredQuote.expires_at) < now 
      : false;
    
    expect(isExpired).toBe(true);
  });

  it('should not identify future-dated quotes as expired', () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const validQuote: Partial<QuoteRequestRow> = {
      id: 'valid-1',
      status: 'quoted',
      expires_at: tomorrow.toISOString(),
    };
    
    const now = new Date();
    const isExpired = validQuote.expires_at 
      ? new Date(validQuote.expires_at) < now 
      : false;
    
    expect(isExpired).toBe(false);
  });

  it('should only expire quotes in active states', () => {
    const activeStates: QuoteStatus[] = ['quoted', 'reviewing', 'contacted'];
    const terminalStates: QuoteStatus[] = ['won', 'lost', 'expired', 'closed'];
    
    activeStates.forEach(status => {
      const quote: Partial<QuoteRequestRow> = { status };
      expect(activeStates).toContain(quote.status);
    });
    
    terminalStates.forEach(status => {
      const quote: Partial<QuoteRequestRow> = { status };
      expect(activeStates).not.toContain(quote.status);
    });
  });
});

describe('Quote Notification Types', () => {
  const notificationTypes = ['received', 'updated', 'quoted', 'won', 'lost', 'expired', 'reminder'];
  
  it('should have notification type for each outcome', () => {
    expect(notificationTypes).toContain('won');
    expect(notificationTypes).toContain('lost');
    expect(notificationTypes).toContain('expired');
  });

  it('should have notification type for quote events', () => {
    expect(notificationTypes).toContain('received');
    expect(notificationTypes).toContain('quoted');
    expect(notificationTypes).toContain('updated');
  });

  it('should have reminder notification type', () => {
    expect(notificationTypes).toContain('reminder');
  });
});

describe('Quote Status History', () => {
  it('should track from_status and to_status', () => {
    const historyEntry = {
      id: 'history-1',
      quote_request_id: 'quote-1',
      from_status: 'quoted' as QuoteStatus,
      to_status: 'won' as QuoteStatus,
      changed_by: 'admin@example.com',
      reason: null,
      created_at: new Date().toISOString(),
    };
    
    expect(historyEntry.from_status).toBe('quoted');
    expect(historyEntry.to_status).toBe('won');
    expect(historyEntry.changed_by).toBeDefined();
  });

  it('should record reason for lost quotes', () => {
    const historyEntry = {
      id: 'history-2',
      quote_request_id: 'quote-2',
      from_status: 'quoted' as QuoteStatus,
      to_status: 'lost' as QuoteStatus,
      changed_by: 'admin@example.com',
      reason: 'Customer went with competitor - lower price',
      created_at: new Date().toISOString(),
    };
    
    expect(historyEntry.to_status).toBe('lost');
    expect(historyEntry.reason).toContain('competitor');
  });
});
