import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminApi, viewerApi } from './index';

afterEach(() => vi.restoreAllMocks());

describe('adminApi recipients', () => {
  it('reissues a pending invitation with CSRF and a stable idempotency key', async () => {
    document.cookie = 'nextstep_admin_csrf=csrf-value; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ id: 'recipient-1', status: 'PENDING', invitationUrl: 'https://dashboard.nextstep-soft.com/app/invite?ref=new' }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await adminApi.reissueRecipientInvitation('tenant-1', 'recipient-1', 'recipient-reissue-stable');

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/tenants/tenant-1/recipients/recipient-1/invitation');
    expect(options?.method).toBe('POST');
    expect((options?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-value');
    expect((options?.headers as Headers).get('Idempotency-Key')).toBe('recipient-reissue-stable');
  });

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

  it('queries permission dependencies without mutating recipient state', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ recipientId: 'recipient-1', permissionsVersion: 2, items: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await adminApi.permissionDependencies('tenant-1', 'recipient-1');
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/tenants/tenant-1/recipients/recipient-1/permission-dependencies');
    expect(options?.method ?? 'GET').toBe('GET');
  });

  it('queries schedule recipient eligibility through the read-only body endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ data: [], selected: [], page: 0, pageSize: 25, total: 0, hasMore: false }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    await adminApi.scheduleRecipientOptions('tenant-1', { reportKeys: ['sales_goods_services'], selectedRecipientIds: [], search: '', page: 0, pageSize: 25 });
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/tenants/tenant-1/schedule-recipient-options/query');
    expect(options?.method).toBe('POST');
  });
});

describe('adminApi tenants', () => {
  it('archives a tenant with its optimistic version and CSRF protection', async () => {
    document.cookie = 'nextstep_admin_csrf=csrf-value; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));

    await adminApi.archiveTenant('tenant-1', 4);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/admin/tenants/tenant-1?version=4');
    expect(options?.method).toBe('DELETE');
    expect((options?.headers as Headers).get('X-CSRF-Token')).toBe('csrf-value');
  });
});

describe('viewerApi delivery contexts', () => {
  it('resolves a reference once through a CSRF-protected body without putting the token in the URL', async () => {
    document.cookie = 'nextstep_viewer_csrf=viewer-csrf; path=/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      deliveryId: '11111111-1111-4111-8111-111111111111', tenantId: '88bfcb51-73fe-469a-964a-675e6386c644', reports: []
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const reference = 'r'.repeat(32);

    await viewerApi.resolveDeliveryContext(reference, '88bfcb51-73fe-469a-964a-675e6386c644');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/viewer/delivery-contexts');
    expect(String(url)).not.toContain(reference);
    expect(options?.method).toBe('POST');
    expect((options?.headers as Headers).get('X-CSRF-Token')).toBe('viewer-csrf');
    expect(options?.body).toContain(reference);
  });

  it('loads a clean delivery report snapshot without calling a run or revalidation endpoint', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await viewerApi.deliveryReport('tenant-id', 'delivery-id', 'sales_goods_services');

    const [url, options] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/viewer/tenants/tenant-id/deliveries/delivery-id/reports/sales_goods_services');
    expect(options?.method ?? 'GET').toBe('GET');
    expect(String(url)).not.toMatch(/runs|revalidations/);
  });
});
