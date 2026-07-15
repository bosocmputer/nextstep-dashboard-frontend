<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, adminApi, type AdminReportDefinition, type ReportRun } from '@/api';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { loadAdminReportCatalog } from '@/stores/reportCatalog';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';

const rows = ref<ReportRun[]>([]);
const loading = ref(false);
const error = ref('');
const cursor = ref<string>();
const hasMore = ref(false);
const status = ref<string>();
const tenantId = ref('');
const statuses = ['QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].map((value) => ({ value, label: statusLabel(value) }));
const selected = ref<ReportRun>();
const reportDefinitions = ref<AdminReportDefinition[]>([]);
const reportDefinitionByKey = computed(() => new Map(reportDefinitions.value.map((item) => [item.reportKey, item])));
let loadGeneration = 0;
let controller: AbortController | undefined;

async function load(reset = true) {
  if (!reset && loading.value) return;
  if (reset) { loadGeneration++; controller?.abort('filters-changed'); controller = new AbortController(); }
  const context = loadGeneration;
  loading.value = true; error.value = '';
  try {
    const page = await adminApi.reportRuns({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value || undefined, status: status.value }, controller?.signal);
    if (context !== loadGeneration) return;
    rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore;
  } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); }
  finally { if (context === loadGeneration) loading.value = false; }
}
function severity(value: string) { return value === 'SUCCEEDED' ? 'success' : value === 'FAILED' ? 'danger' : value === 'RUNNING' || value === 'CLAIMED' ? 'info' : value === 'QUEUED' ? 'warn' : 'secondary'; }
function runStatusLabel(run: ReportRun) { return run.runtimeStatus === 'STALLED' ? 'งานหยุดค้าง' : statusLabel(run.status); }
function runSeverity(run: ReportRun) { return run.runtimeStatus === 'STALLED' ? 'danger' : severity(run.status); }
function waitReasonLabel(value?: string) {
  return ({
    TENANT_BUSY: 'รอรายงานอื่นของร้าน', HOST_BUSY: 'รอ Server ปลายทาง',
    TENANT_COOLDOWN: 'พักการเชื่อมต่อของร้านชั่วคราว', HOST_COOLDOWN: 'Server ปลายทางอยู่ช่วงพัก',
    SCHEDULE_RESERVED: 'รอรอบส่ง LINE ก่อน'
  } as Record<string, string>)[value ?? ''] ?? '';
}
function safeErrorLabel(value?: string | null) {
  return ({
    REPORT_LEASE_EXPIRED: 'Worker หยุดติดตามงานระหว่างดึงข้อมูล ระบบปิดงานนี้เพื่อป้องกัน Query ซ้ำ',
    SML_TIMEOUT: 'Server ลูกค้าใช้เวลาตอบนานเกินกำหนด ระบบหยุดรอบนี้โดยไม่ส่ง LINE',
    REPORT_SET_INCOMPLETE: 'สร้างรายงานในรอบนี้ไม่ครบ ระบบจึงไม่ส่ง LINE'
  } as Record<string, string>)[value ?? ''] ?? '';
}
onMounted(() => {
  void loadAdminReportCatalog().then((catalog) => { reportDefinitions.value = catalog.data; }).catch(() => undefined);
  void load();
});
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="การสร้างรายงาน" subtitle="ตรวจคิวและผลการทำงาน · เวลาไทย" />
  <div class="card table-card">
    <Toolbar class="mb-6 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template><template #end><form class="flex flex-col md:flex-row gap-3" @submit.prevent="load()"><TenantFilterSelect v-model="tenantId" /><Select v-model="status" aria-label="กรองสถานะการสร้างรายงาน" :options="statuses" option-label="label" option-value="value" show-clear placeholder="ทุกสถานะ" class="md:w-48" /><Button type="submit" label="กรอง" icon="pi pi-filter" /></form></template></Toolbar>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="tenantName" header="ร้านค้า" frozen><template #body="{ data }"><span class="font-semibold">{{ data.tenantName || '—' }}</span></template></Column>
      <Column field="reportKey" header="รายงาน"><template #body="{ data }"><div class="font-medium">{{ reportDefinitionByKey.get(data.reportKey)?.label ?? data.reportKey }}</div></template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><div class="grid gap-1"><Tag class="w-fit" :severity="runSeverity(data)" :value="runStatusLabel(data)" /><small v-if="data.waitReason" class="text-muted-color">{{ waitReasonLabel(data.waitReason) }}</small><small v-if="data.retryAvailableAt" class="text-muted-color">ลองใหม่ได้หลัง {{ formatDateTime(data.retryAvailableAt) }}</small></div></template></Column>
      <Column header="ช่วงข้อมูล"><template #body="{ data }">{{ data.dateFrom || '—' }}<span v-if="data.dateTo && data.dateTo !== data.dateFrom"> → {{ data.dateTo }}</span></template></Column>
      <Column field="rowCount" header="จำนวนแถว" header-class="table-number-column" body-class="table-number-column"><template #body="{ data }"><span class="metric-value">{{ data.rowCount.toLocaleString('th-TH') }}</span></template></Column>
      <Column field="queuedAt" header="เข้าคิวเมื่อ"><template #body="{ data }">{{ formatDateTime(data.queuedAt) }}</template></Column>
      <Column field="finishedAt" header="เสร็จเมื่อ"><template #body="{ data }">{{ formatDateTime(data.finishedAt) }}</template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button icon="pi pi-info-circle" text rounded class="touch-action" aria-label="ดูรายละเอียดทางเทคนิค" v-tooltip.top="'รายละเอียดทางเทคนิค'" @click="selected = data" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการสร้างรายงาน</div></template>
    </DataTable>
    <div v-if="hasMore" class="table-footer text-center"><Button label="โหลดเพิ่มเติม" outlined :loading="loading" @click="load(false)" /></div>
  </div>
  <Dialog :visible="!!selected" modal header="รายละเอียดการสร้างรายงาน" class="responsive-dialog" :style="{ width: '34rem' }" @update:visible="selected = undefined"><dl v-if="selected" class="grid grid-cols-[9rem_1fr] gap-3 m-0"><dt>สถานะระบบ</dt><dd class="m-0">{{ runStatusLabel(selected) }}</dd><template v-if="selected.waitReason"><dt>กำลังรอ</dt><dd class="m-0">{{ waitReasonLabel(selected.waitReason) }}</dd></template><template v-if="selected.retryAvailableAt"><dt>ลองใหม่ได้หลัง</dt><dd class="m-0">{{ formatDateTime(selected.retryAvailableAt) }}</dd></template><dt>รหัสงาน</dt><dd class="technical-detail m-0">{{ selected.id }}</dd><dt>รหัสร้าน</dt><dd class="technical-detail m-0">{{ selected.tenantId }}</dd><dt>รหัสข้อผิดพลาด</dt><dd class="technical-detail m-0">{{ selected.safeErrorCode || '—' }}</dd><dt>รายละเอียด</dt><dd class="m-0">{{ safeErrorLabel(selected.safeErrorCode) || selected.safeErrorMessage || '—' }}</dd><dt>หมดอายุ</dt><dd class="m-0">{{ formatDateTime(selected.expiresAt) }}</dd></dl></Dialog>
</template>
