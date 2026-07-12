import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ReportPeriodToolbar from './ReportPeriodToolbar.vue';

const global = {
  stubs: {
    Select: { props: ['modelValue', 'options'], emits: ['update:modelValue'], template: '<select aria-label="ช่วงข้อมูล"><option v-for="item in options" :key="item.value">{{ item.label }}</option></select>' },
    DatePicker: { template: '<input />' },
    Button: { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' },
    Message: { template: '<div><slot /></div>' }
  }
};

describe('ReportPeriodToolbar', () => {
  it('separates the displayed data from the period that will be fetched', () => {
    const wrapper = mount(ReportPeriodToolbar, {
      props: {
        mode: 'SMART_OVERVIEW',
        selection: { periodPreset: 'MONTH_TO_DATE' },
        displayedLabel: 'ข้อมูลล่าสุดแต่ละรายงาน',
        actionLabel: 'อัปเดตภาพรวม'
      },
      global
    });

    expect(wrapper.text()).toContain('ข้อมูลที่กำลังแสดง');
    expect(wrapper.text()).toContain('ข้อมูลล่าสุดแต่ละรายงาน');
    expect(wrapper.text()).toContain('ช่วงที่จะดึง');
    expect(wrapper.text()).toContain('อัปเดตภาพรวม');
  });

  it('keeps current-only reports honest while still allowing a manual refresh', async () => {
    const wrapper = mount(ReportPeriodToolbar, {
      props: {
        mode: 'CURRENT_ONLY',
        selection: { periodPreset: 'MONTH_TO_DATE' },
        displayedLabel: 'สถานะล่าสุด',
        actionLabel: 'ดูสถานะปัจจุบัน'
      },
      global
    });

    expect(wrapper.text()).toContain('รายงานนี้ใช้สถานะปัจจุบัน');
    expect(wrapper.findAll('input')).toHaveLength(0);
    await wrapper.findAll('button').at(-1)!.trigger('click');
    expect(wrapper.emitted('apply')?.[0]).toEqual([{ periodPreset: 'MONTH_TO_DATE' }]);
  });

  it('separates cache lookup from an explicit SML force refresh', async () => {
    const wrapper = mount(ReportPeriodToolbar, {
      props: {
        mode: 'DATE_RANGE',
        selection: { periodPreset: 'MONTH_TO_DATE' },
        actionLabel: 'ดูข้อมูลช่วงนี้',
        forceActionLabel: 'ดึงใหม่จาก SML'
      },
      global
    });

    const buttons = wrapper.findAll('button');
    expect(wrapper.text()).toContain('ดูข้อมูลช่วงนี้');
    expect(wrapper.text()).toContain('ดึงใหม่จาก SML');
    await buttons.find((button) => button.text() === 'ดึงใหม่จาก SML')!.trigger('click');
    expect(wrapper.emitted('force')?.[0]).toEqual([{ periodPreset: 'MONTH_TO_DATE' }]);
    expect(wrapper.emitted('apply')).toBeUndefined();
  });
});
