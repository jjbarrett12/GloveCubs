/**
 * P0-5: Feed upload route — oversized file rejected before reading into memory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './route';

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB (must match route)

vi.mock('@/lib/supplier-portal/auth', () => ({
  validateSession: vi.fn(),
}));

function createRequestWithSession(file: File): Request {
  const formData = new FormData();
  formData.set('file', file);
  const request = new Request('http://localhost/api/feed-upload', {
    method: 'POST',
    body: formData,
  });
  Object.defineProperty(request, 'cookies', {
    value: { get: (name: string) => (name === 'supplier_session' ? { value: 'token' } : undefined) },
    configurable: true,
  });
  return request;
}

describe('Feed upload route P0-5', () => {
  beforeEach(async () => {
    const { validateSession } = await import('@/lib/supplier-portal/auth');
    (validateSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      valid: true,
      supplier_id: 'sup-1',
      user: { id: 'user-1' },
    });
  });

  it('rejects file larger than 10 MB with 400 before reading content (fail-fast before file read)', async () => {
    const oversized = new File(
      [new Uint8Array(MAX_FILE_BYTES + 1)],
      'large.csv',
      { type: 'text/csv' }
    );
    const request = createRequestWithSession(oversized);
    const response = await POST(request);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/too large|10 MB/i);
  });

  it('accepts file at exactly 10 MB (no size error)', async () => {
    const atLimit = new File(
      [new Uint8Array(MAX_FILE_BYTES)],
      'at-limit.csv',
      { type: 'text/csv' }
    );
    const request = createRequestWithSession(atLimit);
    const response = await POST(request);
    if (response.status === 400) {
      const json = await response.json();
      expect(json.error).not.toMatch(/too large|10 MB/i);
    }
  });
});
