import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi } from './index';

afterEach(() => vi.restoreAllMocks());

describe('adminApi recipients', () => {
  it('revokes a recipient within the selected tenant with an authenticated DELETE', async () => {
    document.cookie = 'nextstep_admin_csrf=csrf-value; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await adminApi.revokeRecipient('tenant-1', 'recipient-1');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/tenants/tenant-1/recipients/recipient-1');
    expect(options?.method).toBe('DELETE');
    expect((options?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-value');
  });
});
