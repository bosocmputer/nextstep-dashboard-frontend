import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, newIdempotencyKey } from './client';

afterEach(() => vi.restoreAllMocks());

describe('apiRequest', () => {
  it('sends same-site credentials, CSRF, and idempotency headers', async () => {
    document.cookie = 'nextstep_admin_csrf=csrf-value; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: '1' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await apiRequest('/api/test', { method: 'POST', scope: 'admin', idempotencyKey: 'request-key', body: { value: 1 } });
    const [, options] = fetchMock.mock.calls[0]!;
    const headers = options?.headers as Headers;
    expect(options?.credentials).toBe('same-origin');
    expect(headers.get('X-CSRF-Token')).toBe('csrf-value');
    expect(headers.get('Idempotency-Key')).toBe('request-key');
  });

  it('preserves safe problem details without leaking arbitrary response text', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'VERSION_CONFLICT', message: 'Reload', requestId: 'req-1', retryable: false } }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    await expect(apiRequest('/api/test')).rejects.toEqual(expect.objectContaining({ code: 'VERSION_CONFLICT', requestId: 'req-1' }));
  });

  it('creates compact unique idempotency keys', () => {
    expect(newIdempotencyKey('tenant')).toMatch(/^tenant-[0-9a-f-]{36}$/);
  });
});
