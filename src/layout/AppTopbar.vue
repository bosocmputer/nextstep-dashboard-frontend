<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useLayout } from '@/layout/composables/layout';
import { useAdminSession } from '@/stores/session';

const router = useRouter();
const { toggleMenu, toggleDarkMode, isDarkTheme } = useLayout();
const { state, logout } = useAdminSession();

async function signOut() {
  await logout();
  await router.replace('/admin/login');
}
</script>

<template>
  <header class="layout-topbar">
    <div class="layout-topbar-logo-container">
      <button class="layout-menu-button layout-topbar-action" type="button" aria-label="เปิดหรือปิดเมนู" @click="toggleMenu">
        <i class="pi pi-bars" />
      </button>
      <RouterLink to="/admin" class="layout-topbar-logo" aria-label="Nextstep Dashboard">
        <span class="brand-mark"><i class="pi pi-chart-line" /></span>
        <span>NEXTSTEP</span>
      </RouterLink>
    </div>
    <div class="layout-topbar-actions">
      <button type="button" class="layout-topbar-action" aria-label="สลับโหมดสี" @click="toggleDarkMode">
        <i :class="['pi', isDarkTheme ? 'pi-sun' : 'pi-moon']" />
      </button>
      <span class="hidden md:inline text-sm text-muted-color">{{ state.session?.username }}</span>
      <button type="button" class="layout-topbar-action" aria-label="ออกจากระบบ" @click="signOut">
        <i class="pi pi-sign-out" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.brand-mark { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 0.75rem; color: #fff; background: var(--primary-color); }
</style>
