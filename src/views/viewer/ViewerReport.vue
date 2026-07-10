<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { reportDefinitionByKey, viewerApi, type CreateReportRunInput, type ReportKey, type ReportRun } from '@/api';
import { useViewerSession } from '@/stores/viewer';
import { errorMessage, formatDateOnly, formatDateTime, formatMetric, metricLabel } from '@/utils/format';

const route = useRoute(); const router = useRouter(); const toast = useToast(); const { state } = useViewerSession();
const tenantId = String(route.params.tenantId); const reportKey = String(route.params.reportKey) as ReportKey;
const definition = reportDefinitionByKey.get(reportKey); const tenant = computed(() => state.tenants.find((item) => item.id === tenantId));
const input = reactive<{ periodPreset: CreateReportRunInput['periodPreset']; dateFrom: Date | null; dateTo: Date | null }>({ periodPreset: ['stock_balance','stock_reorder','ar_customer_movement'].includes(reportKey) ? 'AS_OF_RUN' : 'YESTERDAY', dateFrom: null, dateTo: null });
const run = ref<ReportRun>(); const rows = ref<Record<string, unknown>[]>([]); const columns = ref<string[]>([]); const nextCursor = ref<string>(); const hasMore = ref(false); const loading = ref(false); const loadingRows = ref(false); const error = ref('');
let pollTimer: number | undefined; let pollCount = 0;
const active = computed(() => !!run.value && ['QUEUED','CLAIMED','RUNNING'].includes(run.value.status));

async function startRun() {
  if (!definition) { error.value = 'ไม่พบรายงาน'; return; }
  if (input.periodPreset === 'CUSTOM' && (!input.dateFrom || !input.dateTo)) { error.value = 'กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด'; return; }
  if (input.periodPreset === 'CUSTOM' && formatDateOnly(input.dateTo!) < formatDateOnly(input.dateFrom!)) { error.value = 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'; return; }
  stopPolling(); loading.value = true; error.value = ''; rows.value = []; columns.value = []; nextCursor.value = undefined; hasMore.value = false; pollCount = 0;
  const payload: CreateReportRunInput = { periodPreset: input.periodPreset };
  if (input.periodPreset === 'CUSTOM') { payload.dateFrom = formatDateOnly(input.dateFrom!); payload.dateTo = formatDateOnly(input.dateTo!); }
  try { run.value = await viewerApi.createRun(tenantId, reportKey, payload); schedulePoll(); }
  catch (cause) { error.value = errorMessage(cause); loading.value = false; }
}

function schedulePoll() { stopPolling(); pollTimer = window.setTimeout(poll, 1200); }
async function poll() {
  if (!run.value) return;
  try {
    run.value = await viewerApi.run(tenantId, reportKey, run.value.id); pollCount++;
    if (run.value.status === 'SUCCEEDED') { loading.value = false; await loadRows(true); return; }
    if (['FAILED','CANCELLED','EXPIRED'].includes(run.value.status)) { loading.value = false; error.value = run.value.safeErrorMessage || run.value.safeErrorCode || 'Report run ไม่สำเร็จ'; return; }
    if (pollCount > 120) { loading.value = false; error.value = 'รายงานใช้เวลานานกว่าปกติ สามารถกลับมาลองใหม่ได้'; return; }
    schedulePoll();
  } catch (cause) { loading.value = false; error.value = errorMessage(cause); }
}

async function loadRows(reset = false) {
  if (!run.value) return;
  loadingRows.value = true;
  try { const page = await viewerApi.rows(tenantId, reportKey, run.value.id, reset ? undefined : nextCursor.value); rows.value = reset ? page.data : [...rows.value, ...page.data]; columns.value = [...new Set([...columns.value, ...page.columns])]; nextCursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; }
  catch (cause) { error.value = errorMessage(cause); }
  finally { loadingRows.value = false; }
}

async function cancel() { if (!run.value) return; try { run.value = await viewerApi.cancelRun(tenantId, reportKey, run.value.id); loading.value = false; stopPolling(); toast.add({ severity: 'info', summary: 'ยกเลิก Report Run แล้ว', life: 2500 }); } catch (cause) { error.value = errorMessage(cause); } }
function stopPolling() { if (pollTimer) window.clearTimeout(pollTimer); pollTimer = undefined; }
onMounted(startRun); onBeforeUnmount(stopPolling);
</script>

<template>
  <Button label="รายงานทั้งหมด" icon="pi pi-arrow-left" text class="-ml-3 mb-2" @click="router.push('/app')" />
  <div class="page-header"><div><h1 class="page-title">{{ definition?.label ?? reportKey }}</h1><p class="page-subtitle">{{ tenant?.name }} · Fresh SQL run ทุกครั้ง</p></div><Tag v-if="run" :severity="run.status === 'SUCCEEDED' ? 'success' : run.status === 'FAILED' ? 'danger' : active ? 'info' : 'secondary'" :value="run.status" /></div>
  <div class="surface-card rounded-2xl p-4 md:p-5 mb-5"><div class="grid grid-cols-1 md:grid-cols-[14rem_1fr_1fr_auto] gap-3 items-end"><div class="grid gap-2"><label for="report-period">ช่วงข้อมูล</label><Select input-id="report-period" aria-label="ช่วงข้อมูล" v-model="input.periodPreset" :options="[{label:'เมื่อวาน',value:'YESTERDAY'},{label:'วันนี้ถึงปัจจุบัน',value:'TODAY_TO_NOW'},{label:'เดือนนี้ถึงปัจจุบัน',value:'MONTH_TO_DATE'},{label:'ณ เวลารัน',value:'AS_OF_RUN'},{label:'กำหนดเอง',value:'CUSTOM'}]" option-label="label" option-value="value" fluid /></div><div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-from">จากวันที่</label><DatePicker input-id="report-date-from" v-model="input.dateFrom" date-format="yy-mm-dd" fluid /></div><div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-to">ถึงวันที่</label><DatePicker input-id="report-date-to" v-model="input.dateTo" date-format="yy-mm-dd" fluid /></div><div class="flex gap-2"><Button label="รันใหม่" icon="pi pi-refresh" :loading="loading" @click="startRun" /><Button v-if="active" icon="pi pi-stop" severity="danger" outlined aria-label="ยกเลิก" @click="cancel" /></div></div></div>
  <Message v-if="error" severity="error" :closable="false" class="mb-5">{{ error }}</Message>
  <div v-if="loading" class="surface-card rounded-2xl p-6 mb-5"><div class="flex items-center gap-4"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="6" /><div><h2 class="text-lg m-0">กำลังดึงข้อมูลจาก SML</h2><p class="text-muted-color mt-1 mb-0">Run {{ run?.id }} — ไม่ใช้ snapshot เก่า</p></div></div><ProgressBar mode="indeterminate" style="height: .35rem" class="mt-5" /></div>
  <template v-if="run?.status === 'SUCCEEDED'">
    <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"><div v-for="(value, key) in run.summary" :key="key" class="surface-card rounded-xl p-4"><div class="text-xs text-muted-color safe-wrap">{{ metricLabel(String(key)) }}</div><div class="text-xl font-bold mt-2 metric-value safe-wrap">{{ formatMetric(value) }}</div></div><div class="surface-card rounded-xl p-4"><div class="text-xs text-muted-color">จำนวนแถว</div><div class="text-xl font-bold mt-2 metric-value">{{ run.rowCount.toLocaleString('th-TH') }}</div></div></div>
    <div class="surface-card rounded-2xl overflow-hidden"><div class="p-4 border-b border-surface flex flex-wrap items-center justify-between gap-2"><div><h2 class="text-lg font-semibold m-0">รายละเอียด</h2><p class="text-xs text-muted-color mt-1 mb-0">สร้าง {{ formatDateTime(run.finishedAt) }} · แถวชั่วคราวเก็บ 24 ชั่วโมง</p></div><Tag v-if="run.isTruncated" severity="warn" value="ผลลัพธ์ถูกตัดตาม row limit" /></div><DataTable :value="rows" :loading="loadingRows" scrollable striped-rows data-key="__row"><Column v-for="column in columns" :key="column" :field="column" :header="column"><template #body="{ data }"><span class="safe-wrap metric-value">{{ formatMetric(data[column]) }}</span></template></Column><template #empty><div class="py-8 text-center text-muted-color">รายงานนี้ไม่มีข้อมูลในช่วงที่เลือก</div></template></DataTable><div v-if="hasMore" class="p-4 text-center border-t border-surface"><Button label="โหลดอีก 100 แถว" icon="pi pi-angle-down" outlined :loading="loadingRows" @click="loadRows(false)" /></div></div>
  </template>
</template>
