import { expect, type Page, test } from '@playwright/test';

const api = '/api/v1';
const tenantId = '11111111-1111-4111-8111-111111111111';

function json(data: unknown, status = 200) {
  return { status, contentType: 'application/json', body: JSON.stringify(data) };
}

function unauthorized() {
  return json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required.', requestId: 'e2e', retryable: false } }, 401);
}

function captureUnexpectedConsoleErrors(page: Page, allowedStatusCodes: number[] = []) {
  const errors: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    const allowedStatus = allowedStatusCodes.some((status) => text.includes(`status of ${status}`));
    if (message.type() === 'error' && !text.includes('status of 401 (Unauthorized)') && !allowedStatus) errors.push(text);
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

async function mockEmptyExecutiveOverview(page: Page) {
  await page.route(`**${api}/viewer/tenants/${tenantId}/executive-overview`, (route) => route.fulfill(json({
    tenantId,
    timezone: 'Asia/Bangkok',
    items: []
  })));
}

function salesDashboard() {
  return {
    reportKey: 'sales_goods_services',
    version: '1.0.0',
    period: { preset: 'YESTERDAY', dateFrom: '2026-07-09', dateTo: '2026-07-09' },
    comparisonPeriod: { preset: 'CUSTOM', dateFrom: '2026-07-08', dateTo: '2026-07-08' },
    timezone: 'Asia/Bangkok',
    generatedAt: '2026-07-10T07:00:00+07:00',
    kpis: [{
      key: 'total_amount', label: 'ยอดขาย', value: '1250.00', unit: 'THB',
      comparison: { availability: 'UNAVAILABLE' }
    }],
    visualizations: [],
    quality: { status: 'OK', warnings: [] }
  };
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
  await expect(page.getByText('ระบบพร้อมใช้งาน')).toBeVisible();
  await expect(page.getByText('ใช้แล้ว 4,200 / 5,000')).toBeVisible();
  expect(consoleErrors).toEqual([]);
});

test('admin login ignores an external redirect target', async ({ page }) => {
  await mockAdminLogin(page);
  await page.goto('/admin/login?redirect=https://example.com/phishing');
  await page.getByLabel('รหัสผ่าน').fill('local-e2e-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL('/admin');
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

  await expect(page.getByRole('dialog', { name: 'เพิ่มร้านค้า' }).getByRole('alert').filter({ hasText: 'Slug ใช้ตัวพิมพ์เล็ก' })).toBeVisible();
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
  await mockEmptyExecutiveOverview(page);

  await page.goto('/app');

  await expect(page).toHaveURL(`/app/tenant/${tenantId}`);
  await expect(page.getByRole('heading', { name: 'ภาพรวม ร้านตัวอย่าง' })).toBeVisible();
  await page.getByRole('button', { name: 'เปิดหรือปิดเมนู' }).click();
  await expect(page.getByRole('link', { name: 'รายงานขายสินค้าและบริการ' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'รายงานสินค้าถึงจุดสั่งซื้อ' })).toBeVisible();
  await expect(page.getByText('รายงานซื้อสินค้าและตั้งหนี้')).toHaveCount(0);
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  for (const label of ['เปิดหรือปิดเมนู', 'สลับโหมดสี', 'ออกจากระบบ']) {
    const box = await page.getByRole('button', { name: label }).boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(44);
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  expect(consoleErrors).toEqual([]);
});

test('mobile report details use stacked rows without horizontal overflow', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page);
  const runId = '77777777-7777-4777-8777-777777777777';
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(`**${api}/viewer/me`, (route) => route.fulfill(json({
    recipientId: '22222222-2222-4222-8222-222222222222', displayName: 'ผู้ทดสอบ', expiresAt: '2026-07-11T00:00:00Z'
  })));
  await page.route(`**${api}/viewer/tenants`, (route) => route.fulfill(json({
    data: [{ id: tenantId, name: 'ร้านตัวอย่าง', timezone: 'Asia/Bangkok', reportKeys: ['sales_goods_services'] }],
    page: { hasMore: false }
  })));
  await page.route(`**${api}/viewer/tenants/${tenantId}/reports`, (route) => route.fulfill(json({
    data: [{ reportKey: 'sales_goods_services', version: '1.0.0', label: 'รายงานขายสินค้าและบริการ', category: 'SALES', isSensitive: false }],
    page: { hasMore: false }
  })));
  await page.route(`**${api}/viewer/tenants/${tenantId}/reports/sales_goods_services/runs**`, (route) => {
    if (route.request().url().includes('/rows')) {
      expect(route.request().url()).toContain('pageSize=25');
      return route.fulfill(json({
        runId, columns: ['doc_no', 'total_amount', 'last_status'], data: [{ doc_no: 'IV-001', total_amount: '1250.00', last_status: 'USER5' }],
        page: { hasMore: false }
      }));
    }
    if (route.request().url().endsWith('/dashboard')) return route.fulfill(json(salesDashboard()));
    return route.fulfill(json({
      id: runId, tenantId, reportKey: 'sales_goods_services', status: 'SUCCEEDED', periodPreset: 'YESTERDAY',
      dateFrom: '2026-07-09', dateTo: '2026-07-09', rowCount: 1, isTruncated: false,
      summary: { document_count: '1', total_amount: '1250.00' }, queuedAt: '2026-07-10T00:00:00Z',
      finishedAt: '2026-07-10T00:00:01Z', expiresAt: '2026-07-11T00:00:00Z'
    }, route.request().method() === 'POST' ? 201 : 200));
  });

  await page.goto(`/app/tenant/${tenantId}/report/sales_goods_services`);

  await expect(page.getByRole('tab', { name: 'ข้อมูลรายละเอียด' })).toBeVisible();
  await page.getByRole('tab', { name: 'ข้อมูลรายละเอียด' }).click();
  const mobileDetails = page.getByLabel('รายละเอียดรายงานแบบมือถือ');
  await expect(mobileDetails).toBeVisible();
  await expect(mobileDetails.getByText('IV-001')).toBeVisible();
  await expect(mobileDetails.getByText('1,250')).toBeVisible();
  await expect(mobileDetails.getByText('USER5')).toHaveCount(0);
  await page.getByLabel('เลือกคอลัมน์ที่ต้องการแสดง').focus();
  await page.keyboard.press('ArrowDown');
  await page.getByRole('option').filter({ hasText: 'สถานะภายใน' }).click();
  await page.keyboard.press('Escape');
  await mobileDetails.getByRole('button', { name: 'ดูรายละเอียดเพิ่ม' }).click();
  await expect(mobileDetails.getByText('USER5')).toBeVisible();
  const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(hasHorizontalOverflow).toBe(false);
  expect(consoleErrors).toEqual([]);
});

test('admin previews the exact single Flex card with numeric samples', async ({ page }) => {
  const consoleErrors = captureUnexpectedConsoleErrors(page, [404]);
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
  await page.route(`**${api}/admin/tenants/${tenantId}/sml-connection`, (route) => route.fulfill(json({ error: { code: 'SML_NOT_CONFIGURED', message: 'Not configured', requestId: 'e2e', retryable: false } }, 404)));
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
  await page.getByRole('tab', { name: 'การเชื่อมต่อ SML' }).click();
  await page.getByLabel('ชื่อฐานข้อมูล SML').fill('CHANGED_DATA');
  await expect(page.getByRole('button', { name: 'บันทึกการเชื่อมต่อ' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'ทดสอบการเชื่อมต่อ' })).toBeDisabled();
  await expect(page.getByText('บันทึกค่าก่อนทดสอบการเชื่อมต่อ')).toBeVisible();
  await page.getByRole('tab', { name: 'ตารางส่งรายงาน' }).click();
  await page.getByRole('button', { name: 'แก้ไข' }).click();
  const dialog = page.getByRole('dialog', { name: 'แก้ไขตารางส่งรายงาน' });
  await dialog.getByRole('button', { name: 'ดูตัวอย่าง LINE Card' }).click();

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

test('viewer opens all ten report routes with the shared executive layout', async ({ page }) => {
  const reports = [
    ['sales_goods_services', 'รายงานขายสินค้าและบริการ'],
    ['purchase_goods_payables', 'รายงานซื้อสินค้าและตั้งหนี้'],
    ['gross_profit_by_product', 'กำไรขั้นต้นตามสินค้า'],
    ['gross_profit_by_ar_customer', 'กำไรขั้นต้นตามลูกหนี้'],
    ['stock_balance', 'รายงานสต็อกคงเหลือ'],
    ['stock_reorder', 'รายงานสินค้าถึงจุดสั่งซื้อ'],
    ['ar_customer_movement', 'รายงานความเคลื่อนไหวลูกหนี้'],
    ['ar_debt_receipt', 'รายงานรับชำระหนี้'],
    ['cash_bank_receipts', 'รายงานรับเงิน'],
    ['cash_bank_payments', 'รายงานจ่ายเงิน']
  ] as const;
  await page.route(`**${api}/viewer/me`, (route) => route.fulfill(json({ recipientId: '22222222-2222-4222-8222-222222222222', displayName: 'ผู้ทดสอบ', expiresAt: '2026-07-11T00:00:00Z' })));
  await page.route(`**${api}/viewer/tenants`, (route) => route.fulfill(json({ data: [{ id: tenantId, name: 'ร้านตัวอย่าง', timezone: 'Asia/Bangkok', reportKeys: reports.map(([key]) => key) }], page: { hasMore: false } })));
  await page.route(`**${api}/viewer/tenants/${tenantId}/reports`, (route) => route.fulfill(json({ data: reports.map(([reportKey, label]) => ({ reportKey, label, version: '1.0.0', category: 'REPORT', isSensitive: false })), page: { hasMore: false } })));
  await page.route(`**${api}/viewer/tenants/${tenantId}/reports/*/runs**`, (route) => {
    const reportKey = route.request().url().split('/reports/')[1]!.split('/')[0]!;
    if (route.request().url().endsWith('/dashboard')) return route.fulfill(json({ ...salesDashboard(), reportKey }));
    return route.fulfill(json({ id: `${reportKey}-run`, tenantId, reportKey, status: 'SUCCEEDED', periodPreset: reportKey.startsWith('stock_') ? 'AS_OF_RUN' : 'YESTERDAY', dateFrom: '2026-07-09', dateTo: '2026-07-09', rowCount: 0, isTruncated: false, queuedAt: '2026-07-10T00:00:00Z', finishedAt: '2026-07-10T00:00:01Z', expiresAt: '2026-07-11T00:00:00Z' }, route.request().method() === 'POST' ? 201 : 200));
  });

  for (const [reportKey, label] of reports) {
    await page.goto(`/app/tenant/${tenantId}/report/${reportKey}`);
    await expect(page.getByRole('heading', { name: label })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'ภาพรวมและกราฟ' })).toBeVisible();
  }
});
