<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminSession } from '@/stores/session';
import type { NavigationItem } from './menu';
import AppShell from './AppShell.vue';

const router = useRouter();
const route = useRoute();
const { state, logout } = useAdminSession();
const mobileTitle = computed(() => typeof route.meta.pageTitle === 'string' ? route.meta.pageTitle : 'Nextstep Admin');
const model: NavigationItem[] = [
  { label: 'จัดการระบบ', items: [
    { label: 'ภาพรวม', icon: 'pi pi-fw pi-home', to: '/admin' },
    { label: 'ร้านค้า', icon: 'pi pi-fw pi-building', to: '/admin/tenants', activePrefix: '/admin/tenants' }
  ] },
  { label: 'ติดตามการทำงาน', items: [
    { label: 'การสร้างรายงาน', icon: 'pi pi-fw pi-database', to: '/admin/report-runs' },
    { label: 'การส่ง LINE', icon: 'pi pi-fw pi-send', to: '/admin/deliveries' },
    { label: 'ประวัติการใช้งาน', icon: 'pi pi-fw pi-history', to: '/admin/audit' }
  ] }
];

async function signOut() {
  await logout();
  await router.replace('/admin/login');
}
</script>

<template>
  <AppShell :menu-model="model" home-to="/admin" :mobile-title="mobileTitle" mobile-subtitle="Nextstep Admin" :account-label="state.session?.username" confirm-dialogs @sign-out="signOut">
    <RouterView />
  </AppShell>
</template>
