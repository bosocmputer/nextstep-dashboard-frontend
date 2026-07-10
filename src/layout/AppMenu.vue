<script setup lang="ts">
import { ref } from 'vue';
import AppMenuItem from './AppMenuItem.vue';

const model = ref([
  {
    label: 'จัดการระบบ',
    items: [
      { label: 'ภาพรวม', icon: 'pi pi-fw pi-home', to: '/admin' },
      { label: 'ร้านค้า', icon: 'pi pi-fw pi-building', to: '/admin/tenants' }
    ]
  },
  {
    label: 'ติดตามการทำงาน',
    items: [
      { label: 'Report Runs', icon: 'pi pi-fw pi-database', to: '/admin/report-runs' },
      { label: 'LINE Deliveries', icon: 'pi pi-fw pi-send', to: '/admin/deliveries' },
      { label: 'Audit Logs', icon: 'pi pi-fw pi-history', to: '/admin/audit' }
    ]
  }
]);
</script>

<template>
  <ul class="layout-menu">
    <template v-for="(item, index) in model" :key="item.label">
      <AppMenuItem :item="item" :index="index" />
    </template>
  </ul>
</template>

<style scoped lang="scss"></style>
