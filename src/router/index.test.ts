import { describe, expect, it } from 'vitest';
import router from './index';

describe('router shell context metadata', () => {
  it('defines a user-facing page title for every admin screen', () => {
    const adminRoutes = router.getRoutes().filter((route) => String(route.name ?? '').startsWith('admin-') && route.name !== 'admin-login');

    expect(adminRoutes.length).toBeGreaterThan(0);
    for (const route of adminRoutes) expect(route.meta.pageTitle, String(route.name)).toEqual(expect.any(String));
  });

  it('defines clean delivery routes separately from refreshable report routes', () => {
    expect(router.resolve('/app/tenant/tenant-1/delivery/delivery-1').name).toBe('viewer-delivery');
    expect(router.resolve('/app/tenant/tenant-1/delivery/delivery-1/report/sales_goods_services').name).toBe('viewer-delivery-report');
  });
});
