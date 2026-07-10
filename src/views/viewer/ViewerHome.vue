<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { viewerApi, type ReportDefinition } from '@/api';
import { useViewerSession } from '@/stores/viewer';
import { errorMessage } from '@/utils/format';

const router = useRouter(); const { state, setTenants } = useViewerSession();
const selectedTenantId = ref(''); const reports = ref<ReportDefinition[]>([]); const loading = ref(false); const error = ref('');
const selectedTenant = computed(() => state.tenants.find((item) => item.id === selectedTenantId.value));
const tenantOptions = computed(() => [...state.tenants]);

async function loadTenants() {
  if (!state.tenants.length) setTenants((await viewerApi.tenants()).data);
  if (!selectedTenantId.value && state.tenants[0]) selectedTenantId.value = state.tenants[0].id;
}
async function loadReports() {
  if (!selectedTenantId.value) return;
  loading.value = true; error.value = '';
  try { reports.value = (await viewerApi.reports(selectedTenantId.value)).data; }
  catch (cause) { error.value = errorMessage(cause); }
  finally { loading.value = false; }
}
watch(selectedTenantId, loadReports);
onMounted(loadTenants);
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">รายงานของฉัน</h1><p class="page-subtitle">ระบบจะดึงข้อมูลใหม่จาก SQL ของร้านทุกครั้งที่เปิดรายงาน</p></div><Select v-if="state.tenants.length > 1" v-model="selectedTenantId" :options="tenantOptions" option-label="name" option-value="id" class="w-full sm:w-72" /></div>
  <Message severity="info" :closable="false" class="mb-5"><strong>{{ selectedTenant?.name }}</strong> · {{ selectedTenant?.timezone }} — สิทธิ์จะถูกตรวจซ้ำก่อนรันทุกครั้ง</Message>
  <Message v-if="error" severity="error" :closable="false">{{ error }} <Button label="ลองใหม่" text @click="loadReports" /></Message>
  <div v-else-if="loading" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"><Skeleton v-for="index in 6" :key="index" height="9rem" border-radius="1rem" /></div>
  <div v-else-if="reports.length" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    <button v-for="item in reports" :key="item.reportKey" type="button" class="surface-card rounded-2xl p-5 text-left cursor-pointer bg-surface-0 dark:bg-surface-900 hover:border-primary transition-all" @click="router.push(`/app/tenant/${selectedTenantId}/report/${item.reportKey}`)"><div class="flex items-start justify-between gap-3"><span class="grid place-items-center w-11 h-11 rounded-xl bg-primary-50 dark:bg-primary-950 text-primary"><i class="pi pi-chart-bar" /></span><i v-if="item.isSensitive" class="pi pi-lock text-orange-500" title="ข้อมูลอ่อนไหว" /></div><h2 class="text-lg font-semibold mt-4 mb-2">{{ item.label }}</h2><div class="flex items-center justify-between text-sm text-muted-color"><span>{{ item.category }}</span><span class="text-primary font-medium">เปิดรายงาน <i class="pi pi-arrow-right text-xs" /></span></div></button>
  </div>
  <div v-else class="surface-card rounded-2xl p-8 text-center"><i class="pi pi-lock text-4xl text-muted-color" /><h2>ยังไม่มีสิทธิ์รายงาน</h2><p class="text-muted-color">ติดต่อผู้ดูแลเพื่อกำหนดสิทธิ์อย่างน้อย 1 รายงาน</p></div>
</template>
