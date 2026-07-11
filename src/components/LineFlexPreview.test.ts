import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import LineFlexPreview from './LineFlexPreview.vue';
import type { FlexPreview } from '@/api';

const preview: FlexPreview = {
  altText: 'รายงาน ร้านตัวอย่าง — ข้อมูลวันที่ 2026-07-10',
  tenantName: 'ร้านตัวอย่าง',
  period: { preset: 'YESTERDAY', dateFrom: '2026-07-10', dateTo: '2026-07-10' },
  periodLabel: 'ข้อมูลวันที่ 2026-07-10',
  generatedAt: '2026-07-11T01:30:00+07:00',
  actionUrl: 'https://dashboard.nextstep-soft.com/app',
  payloadBytes: 2048,
  message: {},
  reports: [
    {
      key: 'sales_goods_services',
      label: 'รายงานขายสินค้าและบริการ',
      categoryLabel: 'ขาย',
      primary: { label: 'ยอดขาย', value: '1,234,567.89' },
      supporting: [{ label: 'จำนวนเอกสาร', value: '128' }, { label: 'ยอดเฉลี่ยต่อเอกสาร', value: '9,645.06' }],
      comparison: { text: '↓ 7.82% จากช่วงก่อน', direction: 'DOWN' },
      attention: { severity: 'WARNING', text: 'ตัวอย่างสถานะที่ต้องตรวจสอบ' },
      actionUrl: 'https://dashboard.nextstep-soft.com/app/tenant/t/report/sales_goods_services',
      metrics: [{ label: 'เอกสาร', value: '128' }, { label: 'ยอดขาย', value: '1,234,567.89' }]
    }
  ]
};

describe('LineFlexPreview', () => {
  it('labels numeric samples and renders the backend preview values', () => {
    const wrapper = mount(LineFlexPreview, {
      props: { preview },
      global: { stubs: { Tag: { template: '<span><slot />{{ value }}</span>', props: ['value'] } } }
    });

    expect(wrapper.text()).toContain('ตัวเลขสมมติเท่านั้น');
    expect(wrapper.text()).toContain('ไม่ดึงข้อมูลจาก SML');
    expect(wrapper.text()).toContain('รายงานขายสินค้าและบริการ');
    expect(wrapper.text()).toContain('1,234,567.89');
    expect(wrapper.text()).not.toContain('฿');
    expect(wrapper.text()).toContain('↓ 7.82% จากช่วงก่อน');
    expect(wrapper.text()).toContain('ตัวอย่างสถานะที่ต้องตรวจสอบ');
    expect(wrapper.text()).toContain('เปิดภาพรวมร้าน');
    expect(wrapper.text()).toContain('2.0 KB');
    expect(wrapper.find('[role="button"]').attributes('aria-disabled')).toBe('true');
  });
});
