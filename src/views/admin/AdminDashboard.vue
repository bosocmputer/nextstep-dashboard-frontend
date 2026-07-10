<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { apiRequest } from '@/api/client';
import { reportDefinitions } from '@/api';

const ready = ref<'checking' | 'ready' | 'unavailable'>('checking');
onMounted(async () => {
  try { await apiRequest('/api/v1/health/ready', { timeoutMs: 3000 }); ready.value = 'ready'; }
  catch { ready.value = 'unavailable'; }
});

const shortcuts = [
  { label: 'จัดการร้านค้า', detail: 'SML, ผู้รับ และ schedule', icon: 'pi-building', to: '/admin/tenants' },
  { label: 'ตรวจ Report Runs', detail: 'ดู queue, success และ failure', icon: 'pi-database', to: '/admin/report-runs' },
  { label: 'ตรวจ LINE Delivery', detail: 'ดู retry และผลส่ง', icon: 'pi-send', to: '/admin/deliveries' }
];
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">ภาพรวมระบบ</h1><p class="page-subtitle">ศูนย์ควบคุมรายงาน SML และ LINE delivery</p></div><Tag :severity="ready === 'ready' ? 'success' : ready === 'checking' ? 'secondary' : 'danger'" :value="ready === 'ready' ? 'API พร้อมใช้งาน' : ready === 'checking' ? 'กำลังตรวจสอบ' : 'API ไม่พร้อม'" /></div>
  <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
    <RouterLink v-for="item in shortcuts" :key="item.to" :to="item.to" class="surface-card rounded-xl p-5 no-underline text-color hover:border-primary transition-colors">
      <div class="flex items-start justify-between"><div><h2 class="text-lg font-semibold mt-0 mb-2">{{ item.label }}</h2><p class="m-0 text-muted-color">{{ item.detail }}</p></div><span class="grid place-items-center w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-950 text-primary"><i :class="['pi', item.icon]" /></span></div>
    </RouterLink>
  </div>
  <div class="surface-card rounded-xl p-6">
    <div class="flex items-center justify-between gap-3 mb-4"><div><h2 class="text-xl font-semibold m-0">Report Catalog V1</h2><p class="text-muted-color mt-1 mb-0">SQL ที่อนุมัติล่วงหน้าเท่านั้น</p></div><Badge :value="reportDefinitions.length" /></div>
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3"><div v-for="report in reportDefinitions" :key="report.reportKey" class="rounded-lg border border-surface p-4"><div class="flex items-start justify-between gap-2"><span class="font-medium">{{ report.label }}</span><i v-if="report.isSensitive" class="pi pi-lock text-orange-500" title="ข้อมูลอ่อนไหว" /></div><code class="block mt-2 text-xs text-muted-color safe-wrap">{{ report.reportKey }}</code></div></div>
  </div>
</template>
