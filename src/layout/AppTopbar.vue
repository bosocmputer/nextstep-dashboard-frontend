<script setup lang="ts">
import { useLayout } from '@/layout/composables/layout';

const { toggleMenu, toggleDarkMode, isDarkTheme } = useLayout();
defineProps<{ homeTo: string; accountLabel?: string }>();
defineEmits<{ signOut: [] }>();
</script>

<template>
  <header class="layout-topbar">
    <div class="layout-topbar-logo-container">
      <button class="layout-menu-button layout-topbar-action" type="button" aria-label="เปิดหรือปิดเมนู" @click="toggleMenu">
        <i class="pi pi-bars" />
      </button>
      <RouterLink :to="homeTo" class="layout-topbar-logo" aria-label="Nextstep Dashboard">
        <span class="brand-mark"><i class="pi pi-chart-line" /></span>
        <span class="brand-name">NEXTSTEP</span>
      </RouterLink>
    </div>
    <div class="layout-topbar-actions">
      <slot name="context" />
      <button type="button" class="layout-topbar-action topbar-button" aria-label="สลับโหมดสี" @click="toggleDarkMode">
        <i :class="['pi', isDarkTheme ? 'pi-sun' : 'pi-moon']" />
      </button>
      <span v-if="accountLabel" class="hidden md:inline self-center text-sm text-muted-color">{{ accountLabel }}</span>
      <button type="button" class="layout-topbar-action topbar-button" aria-label="ออกจากระบบ" @click="$emit('signOut')">
        <i class="pi pi-sign-out" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.brand-mark { display: grid; place-items: center; width: 2.25rem; height: 2.25rem; border-radius: 0.75rem; color: #fff; background: var(--primary-color); }
.topbar-button { border: 0; background: transparent; padding: 0; }
@media (max-width: 575px) { .brand-name { display: none; } }
</style>
