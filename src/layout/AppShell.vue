<script setup lang="ts">
import { computed } from 'vue';
import { useLayout } from '@/layout/composables/layout';
import type { NavigationItem } from './menu';
import AppFooter from './AppFooter.vue';
import AppSidebar from './AppSidebar.vue';
import AppTopbar from './AppTopbar.vue';

defineProps<{
  menuModel: NavigationItem[];
  homeTo: string;
  accountLabel?: string;
  confirmDialogs?: boolean;
}>();

defineEmits<{ signOut: [] }>();

const { layoutConfig, layoutState, hideMobileMenu } = useLayout();
const containerClass = computed(() => ({
  'layout-overlay': layoutConfig.menuMode === 'overlay',
  'layout-static': layoutConfig.menuMode === 'static',
  'layout-overlay-active': layoutState.overlayMenuActive,
  'layout-mobile-active': layoutState.mobileMenuActive,
  'layout-static-inactive': layoutState.staticMenuInactive
}));
</script>

<template>
  <div class="layout-wrapper" :class="containerClass">
    <AppTopbar :home-to="homeTo" :account-label="accountLabel" @sign-out="$emit('signOut')">
      <template #context><slot name="topbar-context" /></template>
    </AppTopbar>
    <AppSidebar :model="menuModel" />
    <div class="layout-main-container">
      <main class="layout-main"><slot /></main>
      <AppFooter />
    </div>
    <div class="layout-mask animate-fadein" @click="hideMobileMenu" />
  </div>
  <Toast />
  <ConfirmDialog v-if="confirmDialogs" />
</template>
