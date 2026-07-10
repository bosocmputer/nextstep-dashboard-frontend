import { expect, type Page, test } from '@playwright/test';

const api = '/api/v1';
const tenantId = '11111111-1111-4111-8111-111111111111';

function json(data: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

function unauthorized() {
  return json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.', requestId: 'e2e', retryable: false } }, 401);
}

function captureUnexpectedConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !text.includes('status of 401 (Unauthorized)')) errors.push(text);
  });
  return errors;
}

async function mockAdminLogin(page: Page) {
  let authenticated = false;
  const session = { username: 'superadmin', expiresAt: '2026-07-11T00:00:00Z', mustRotateBootstrapPassword: false };
  await page.route(`**${api}/auth/admin/session`, (route) => route.fulfill(authenticated ? json(session) : unauthorized()));
  await page.route(`**${api}/auth/admin/login`, (route) => {
    authenticated = true;
    return route.fulfill(json(session));
  });
  await page.route(`**${api}/health/ready`, (route) => route.fulfill(json({ status: 'ready' })));
  await page.route(`**${api}/admin/line-quota`, (route) => route.fulfill(json({
    state: 'READY', providerLimit: 5000, providerConsumed: 4200, locallyAccepted: 24,
    operationalReservePercent: 10, syncedAt: '2026-07-10T12:00:00Z'
  })));
}

test('admin guard redirects an anonymous user to sign in', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page);
  await page.route(`**${api}/auth/admin/session`, (route) => route.fulfill(unauthorized()));

  await page.goto('/admin/tenants');

  await expect(page).toHaveURL(/\/admin\/login\?redirect=/);
  await expect(page.getByRole('heading', { name: 'Nextstep Admin' })).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('admin can sign in and sees API readiness', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page);
  await mockAdminLogin(page);
  await page.goto('/admin/login');

  await page.getByLabel('รหัสผ่าน').fill('local-e2e-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();

  await expect(page).toHaveURL('/admin');
  await expect(page.getByRole('heading', { name: 'ภาพรวมระบบ' })).toBeVisible();
  await expect(page.getByText('API พร้อมใช้งาน')).toBeVisible();
  await expect(page.getByText('ใช้แล้ว 4,200 / 5,000')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('tenant form blocks an invalid slug before sending', async ({ page }) => {
  await mockAdminLogin(page);
  let createRequests = 0;
  await page.route(`**${api}/admin/tenants**`, async (route) => {
    if (route.request().method() === 'POST') {
      createRequests++;
      await route.fulfill(json({ error: { code: 'SHOULD_NOT_SEND', message: 'Invalid request', requestId: 'e2e', retryable: false } }, 422));
      return;
    }
    await route.fulfill(json({ data: [], page: { hasMore: false } }));
  });
  await page.goto('/admin/login');
  await page.getByLabel('รหัสผ่าน').fill('local-e2e-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await page.goto('/admin/tenants');

  await page.getByRole('button', { name: 'เพิ่มร้านค้า' }).click();
  await page.getByLabel('ชื่อร้าน').fill('ร้านทดสอบ');
  await page.getByLabel('Slug', { exact: true }).fill('Invalid Slug');
  await page.getByRole('button', { name: 'สร้างร้านค้า' }).click();

  await expect(page.getByRole('dialog', { name: 'เพิ่มร้านค้า' }).getByRole('alert')).toContainText('Slug ใช้ตัวพิมพ์เล็ก');
  expect(createRequests).toBe(0);
});

test('mobile viewer renders only reports returned by permission API', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**${api}/viewer/me`, (route) => route.fulfill(json({
    recipientId: '22222222-2222-4222-8222-222222222222', displayName: 'ผู้ทดสอบ', expiresAt: '2026-07-11T00:00:00Z'
  })));
  await page.route(`**${api}/viewer/tenants`, (route) => route.fulfill(json({
    data: [{ id: tenantId, name: 'ร้านตัวอย่าง', timezone: 'Asia/Bangkok', reportKeys: ['sales_goods_services', 'stock_reorder'] }],
    page: { hasMore: false }
  })));
  await page.route(`**${api}/viewer/tenants/${tenantId}/reports`, (route) => route.fulfill(json({
    data: [
      { reportKey: 'sales_goods_services', version: '1.0.0', label: 'รายงานขายสินค้าและบริการ', category: 'SALES', isSensitive: false },
      { reportKey: 'stock_reorder', version: '1.0.0', label: 'รายงานสินค้าถึงจุดสั่งซื้อ', category: 'INVENTORY', isSensitive: false }
    ],
    page: { hasMore: false }
  })));

  await page.goto('/app');

  await expect(page.getByRole('heading', { name: 'รายงานของฉัน' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'รายงานขายสินค้าและบริการ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'รายงานสินค้าถึงจุดสั่งซื้อ' })).toBeVisible();
  await expect(page.getByText('รายงานซื้อสินค้าและตั้งหนี้')).toHaveCount(0);
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('admin previews the exact single Flex card with numeric samples', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page);
  const session = { username: 'superadmin', expiresAt: '2026-07-11T00:00:00Z', mustRotateBootstrapPassword: false };
  const recipientId = '33333333-3333-4333-8333-333333333333';
  let previewRequests = 0;
  let testSendRequests = 0;
  let tenantPatchRequests = 0;

  await page.route(`**${api}/auth/admin/session`, (route) => route.fulfill(json(session)));
  await page.route(`**${api}/admin/tenants/${tenantId}`, (route) => {
    if (route.request().method() === 'PATCH') tenantPatchRequests++;
    return route.fulfill(json({
      id: tenantId, slug: 'sample-shop', name: 'ร้านตัวอย่าง', timezone: 'Asia/Bangkok',
      status: route.request().method() === 'PATCH' ? 'DISABLED' : 'ACTIVE',
      accessEndsAt: '2027-07-10T00:00:00Z', version: route.request().method() === 'PATCH' ? 2 : 1, smlReadiness: 'READY',
      createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-10T00:00:00Z'
    }));
  });
  await page.route(`**${api}/admin/tenants/${tenantId}/sml-connection`, (route) => route.fulfill(json({
    isConfigured: true, endpointHost: 'sml-shop.example.com:8092', databaseName: 'DEMO_DATA',
    configFileName: 'SMLConfigDemo.xml', readinessStatus: 'READY', version: 1
  })));
  await page.route(`**${api}/admin/tenants/${tenantId}/recipients**`, (route) => route.fulfill(json({
    data: [{ id: recipientId, status: 'ACTIVE', displayName: 'เจ้าของร้าน', reportKeys: ['sales_goods_services'], createdAt: '2026-07-01T00:00:00Z' }],
    page: { hasMore: false }
  })));
  await page.route(`**${api}/admin/tenants/${tenantId}/schedules**`, async (route) => {
    if (route.request().url().endsWith('/preview')) {
      previewRequests++;
      expect(route.request().postDataJSON()).toEqual({ periodPreset: 'YESTERDAY', reportKeys: ['sales_goods_services'] });
      await route.fulfill(json({
        altText: 'รายงาน ร้านตัวอย่าง — ข้อมูลวันที่ 2026-07-10', tenantName: 'ร้านตัวอย่าง',
        period: { preset: 'YESTERDAY', dateFrom: '2026-07-10', dateTo: '2026-07-10' },
        periodLabel: 'ข้อมูลวันที่ 2026-07-10', generatedAt: '2026-07-11T01:30:00+07:00',
        actionUrl: 'https://dashboard.nextstep-soft.com/app', payloadBytes: 2048, message: {},
        reports: [{ key: 'sales_goods_services', label: 'รายงานขายสินค้าและบริการ', metrics: [
          { label: 'เอกสาร', value: '128' }, { label: 'ยอดขาย', value: '1,234,567.89' }
        ] }]
      }));
      return;
    }
    if (route.request().url().endsWith('/test-send')) {
      testSendRequests++;
      await route.fulfill(json({
        id: '55555555-5555-4555-8555-555555555555', tenantId, scheduleId: '44444444-4444-4444-8444-444444444444',
        scheduledFor: '2026-07-10T12:00:00Z', status: 'COLLECTING',
        reportRunIds: ['66666666-6666-4666-8666-666666666666']
      }, 202));
      return;
    }
    await route.fulfill(json({
      data: [{
        id: '44444444-4444-4444-8444-444444444444', tenantId, name: 'Morning', daysOfWeek: [1, 2, 3, 4, 5],
        localTime: '09:00', timezone: 'Asia/Bangkok', periodPreset: 'YESTERDAY',
        reportKeys: ['sales_goods_services'], recipientIds: [recipientId], status: 'DRAFT', version: 1,
        readinessBlockers: [], nextOccurrences: ['2026-07-13T02:00:00Z'],
        createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-10T00:00:00Z'
      }],
      page: { hasMore: false }
    }));
  });

  await page.goto(`/admin/tenants/${tenantId}`);
  await page.getByRole('tab', { name: 'Schedules' }).click();
  await page.getByRole('button', { name: 'แก้ไข' }).click();
  const dialog = page.getByRole('dialog', { name: 'แก้ไข Schedule' });
  await dialog.getByRole('button', { name: 'ดูตัวอย่าง Flex' }).click();

  await expect(dialog.getByLabel('ตัวอย่าง LINE Flex Message')).toBeVisible();
  await expect(dialog.getByText('ตัวเลขสมมติเท่านั้น')).toBeVisible();
  await expect(dialog.getByText('1,234,567.89')).toBeVisible();
  expect(previewRequests).toBe(1);
  await dialog.getByRole('button', { name: 'ยกเลิก' }).click();

  await page.getByRole('button', { name: 'ทดสอบส่ง LINE' }).click();
  await expect(page.getByText('ยืนยันส่ง LINE จริง')).toBeVisible();
  await expect(page.getByText('ใช้ quota ของ OA กลาง')).toBeVisible();
  expect(testSendRequests).toBe(0);
  await page.getByRole('button', { name: 'ดึงข้อมูลและส่งจริง' }).click();
  await expect(page.getByText('รับคำขอทดสอบส่งแล้ว')).toBeVisible();
  expect(testSendRequests).toBe(1);

  await page.getByRole('tab', { name: 'ข้อมูลร้าน' }).click();
  await page.getByLabel('สถานะ').click();
  await page.getByRole('option', { name: 'DISABLED' }).click();
  await page.getByRole('button', { name: 'บันทึกข้อมูลร้าน' }).click();
  await expect(page.getByText('ยืนยันการเปลี่ยนสิทธิ์ร้าน')).toBeVisible();
  await expect(page.getByText('หยุดการเปิด Dashboard')).toBeVisible();
  expect(tenantPatchRequests).toBe(0);
  await page.getByRole('button', { name: 'ยืนยันและบันทึก' }).click();
  await expect(page.getByText('บันทึกร้านค้าแล้ว')).toBeVisible();
  expect(tenantPatchRequests).toBe(1);
  expect(consoleErrors).toEqual([]);
});
