import { mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLayout } from '@/layout/composables/layout';
import AppShell from './AppShell.vue';

const sidebarStub = {
  name: 'AppSidebar',
  template: '<aside id="app-sidebar"><button data-testid="first-sidebar-action">เมนูแรก</button><slot /></aside>'
};

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  useLayout().layoutState.mobileMenuActive = false;
});

afterEach(() => {
  document.body.classList.remove('blocked-scroll');
  useLayout().layoutState.mobileMenuActive = false;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
});

describe('AppShell mobile drawer lifecycle', () => {
  it('locks background scrolling, moves focus into the drawer, and restores focus after Escape', async () => {
    const wrapper = mount(AppShell, {
      attachTo: document.body,
      props: { menuModel: [], homeTo: '/app', mobileTitle: 'วาวา', mobileSubtitle: 'ภาพรวม' },
      global: {
        stubs: {
          AppSidebar: sidebarStub,
          AppFooter: true,
          RouterLink: { template: '<a><slot /></a>' },
          Toast: true,
          ConfirmDialog: true
        }
      }
    });
    const menuButton = wrapper.get('[aria-label="เปิดหรือปิดเมนู"]');

    (menuButton.element as HTMLElement).focus();
    await menuButton.trigger('click');
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.body.classList.contains('blocked-scroll')).toBe(true);
    expect(document.activeElement).toBe(wrapper.get('[data-testid="first-sidebar-action"]').element);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await wrapper.vm.$nextTick();
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(document.body.classList.contains('blocked-scroll')).toBe(false);
    expect(document.activeElement).toBe(menuButton.element);
    wrapper.unmount();
  });

  it('removes the scroll lock when the shell unmounts while the drawer is open', async () => {
    const wrapper = mount(AppShell, {
      attachTo: document.body,
      props: { menuModel: [], homeTo: '/admin', mobileTitle: 'ร้านค้า' },
      global: { stubs: { AppSidebar: sidebarStub, AppFooter: true, RouterLink: true, Toast: true, ConfirmDialog: true } }
    });

    await wrapper.get('[aria-label="เปิดหรือปิดเมนู"]').trigger('click');
    expect(document.body.classList.contains('blocked-scroll')).toBe(true);
    wrapper.unmount();

    expect(document.body.classList.contains('blocked-scroll')).toBe(false);
  });
});
