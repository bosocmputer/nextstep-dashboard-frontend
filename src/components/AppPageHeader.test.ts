import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AppPageHeader from './AppPageHeader.vue';

describe('AppPageHeader', () => {
  it('marks route context headings for mobile visual deduplication without removing the h1', () => {
    const wrapper = mount(AppPageHeader, { props: { title: 'ภาพรวมระบบ', subtitle: 'ศูนย์ควบคุมรายงาน', mobileMode: 'context' } });

    expect(wrapper.get('h1').text()).toBe('ภาพรวมระบบ');
    expect(wrapper.get('.page-header').classes()).toContain('page-header-context');
  });

  it('keeps entity context visible and composes back and action slots', () => {
    const wrapper = mount(AppPageHeader, {
      props: { title: 'วาวา', subtitle: 'เวลาไทย', mobileMode: 'entity' },
      slots: { back: '<button>กลับ</button>', actions: '<span>ใช้งาน</span>' }
    });

    expect(wrapper.get('.page-header').classes()).toContain('page-header-entity');
    expect(wrapper.text()).toContain('กลับ');
    expect(wrapper.text()).toContain('ใช้งาน');
  });
});
