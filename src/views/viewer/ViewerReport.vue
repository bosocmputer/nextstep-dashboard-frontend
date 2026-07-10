<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import ExecutiveChart from '@/components/dashboard/ExecutiveChart.vue';
import { reportDefinitionByKey, viewerApi, type CreateReportRunInput, type ReportDashboard, type ReportKey, type ReportRun } from '@/api';
import { useViewerSession } from '@/stores/viewer';
import { formatDashboardValue, periodLabel } from '@/utils/dashboard';
import { errorMessage, formatDateOnly, formatDateTime, formatMetric, metricLabel } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const { state, selectTenant, ensureReports } = useViewerSession();
const tenantId = computed(() => String(route.params.tenantId));
const reportKey = computed(() => String(route.params.reportKey) as ReportKey);
const definition = computed(() => reportDefinitionByKey.get(reportKey.value));
const tenant = computed(() => state.tenants.find((item) => item.id === tenantId.value));
const input = reactive<{ periodPreset: CreateReportRunInput['periodPreset']; dateFrom: Date | null; dateTo: Date | null }>({ periodPreset: 'YESTERDAY', dateFrom: null, dateTo: null });
const run = ref<ReportRun>();
const dashboard = ref<ReportDashboard>();
const rows = ref<Record<string, unknown>[]>([]);
const columns = ref<string[]>([]);
const nextCursor = ref<string>();
const hasMore = ref(false);
const rowsLoaded = ref(false);
const activeTab = ref('overview');
const loading = ref(false);
const loadingRows = ref(false);
const error = ref('');
let pollTimer: number | undefined;
let pollCount = 0;

const active = computed(() => !!run.value && ['QUEUED', 'CLAIMED', 'RUNNING'].includes(run.value.status));
const statusLabel = computed(() => {
  const labels: Record<string, string> = { QUEUED: 'รอคิว', CLAIMED: 'กำลังเตรียม', RUNNING: 'กำลังดึงข้อมูล', SUCCEEDED: 'พร้อมใช้งาน', FAILED: 'ไม่สำเร็จ', CANCELLED: 'ยกเลิกแล้ว', EXPIRED: 'หมดอายุ' };
  return run.value ? labels[run.value.status] ?? run.value.status : '';
});
const statusSeverity = computed(() => run.value?.status === 'SUCCEEDED' ? 'success' : run.value?.status === 'FAILED' ? 'danger' : active.value ? 'info' : 'secondary');
const periodOptions = [
  { label: 'เมื่อวาน', value: 'YESTERDAY' },
  { label: 'วันนี้ถึงปัจจุบัน', value: 'TODAY_TO_NOW' },
  { label: 'เดือนนี้ถึงปัจจุบัน', value: 'MONTH_TO_DATE' },
  { label: 'ณ เวลาที่อัปเดต', value: 'AS_OF_RUN' },
  { label: 'กำหนดช่วงวันที่', value: 'CUSTOM' }
];

function setDefaultPeriod() {
  input.periodPreset = ['stock_balance', 'stock_reorder', 'ar_customer_movement'].includes(reportKey.value) ? 'AS_OF_RUN' : 'YESTERDAY';
}

async function startRun() {
  if (!definition.value) { error.value = 'ไม่พบรายงานหรือคุณไม่มีสิทธิ์เปิดรายงานนี้'; return; }
  if (input.periodPreset === 'CUSTOM' && (!input.dateFrom || !input.dateTo)) { error.value = 'กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด'; return; }
  if (input.periodPreset === 'CUSTOM' && formatDateOnly(input.dateTo!) < formatDateOnly(input.dateFrom!)) { error.value = 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'; return; }
  stopPolling();
  loading.value = true; error.value = ''; dashboard.value = undefined; run.value = undefined; activeTab.value = 'overview';
  rows.value = []; columns.value = []; nextCursor.value = undefined; hasMore.value = false; rowsLoaded.value = false; pollCount = 0;
  const payload: CreateReportRunInput = { periodPreset: input.periodPreset };
  if (input.periodPreset === 'CUSTOM') { payload.dateFrom = formatDateOnly(input.dateFrom!); payload.dateTo = formatDateOnly(input.dateTo!); }
  try { run.value = await viewerApi.createRun(tenantId.value, reportKey.value, payload); schedulePoll(); }
  catch (cause) { error.value = errorMessage(cause); loading.value = false; }
}

function schedulePoll() {
  stopPolling();
  const delay = document.visibilityState === 'hidden' ? 5000 : Math.min(1200 + pollCount * 100, 3000);
  pollTimer = window.setTimeout(poll, delay);
}

async function poll() {
  if (!run.value) return;
  try {
    run.value = await viewerApi.run(tenantId.value, reportKey.value, run.value.id); pollCount++;
    if (run.value.status === 'SUCCEEDED') { await loadDashboard(); loading.value = false; return; }
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(run.value.status)) { loading.value = false; error.value = run.value.safeErrorMessage || 'สร้างรายงานไม่สำเร็จ กรุณาลองใหม่'; return; }
    if (pollCount > 240) { loading.value = false; error.value = 'รายงานใช้เวลานานกว่าปกติ คุณสามารถออกจากหน้านี้แล้วกลับมารันใหม่ได้'; return; }
    schedulePoll();
  } catch (cause) { loading.value = false; error.value = errorMessage(cause); }
}

async function loadDashboard() {
  if (!run.value) return;
  try { dashboard.value = await viewerApi.dashboard(tenantId.value, reportKey.value, run.value.id); }
  catch (cause) { error.value = errorMessage(cause); }
}

async function loadRows(reset = false) {
  if (!run.value || loadingRows.value) return;
  loadingRows.value = true;
  try {
    const page = await viewerApi.rows(tenantId.value, reportKey.value, run.value.id, reset ? undefined : nextCursor.value);
    rows.value = reset ? page.data : [...rows.value, ...page.data];
    columns.value = [...new Set([...columns.value, ...page.columns])];
    nextCursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; rowsLoaded.value = true;
  } catch (cause) { error.value = errorMessage(cause); }
  finally { loadingRows.value = false; }
}

async function cancel() {
  if (!run.value) return;
  try { run.value = await viewerApi.cancelRun(tenantId.value, reportKey.value, run.value.id); loading.value = false; stopPolling(); toast.add({ severity: 'info', summary: 'ยกเลิกการสร้างรายงานแล้ว', life: 2500 }); }
  catch (cause) { error.value = errorMessage(cause); }
}

function stopPolling() { if (pollTimer) window.clearTimeout(pollTimer); pollTimer = undefined; }
async function initialize() {
  error.value = '';
  try {
    selectTenant(tenantId.value);
    const permittedReports = await ensureReports(tenantId.value);
    if (!permittedReports.some((item) => item.reportKey === reportKey.value)) {
      error.value = 'คุณไม่มีสิทธิ์เปิดรายงานนี้ กรุณาเลือกจากเมนูรายงาน';
      return;
    }
    setDefaultPeriod(); await startRun();
  } catch (cause) { error.value = errorMessage(cause); loading.value = false; }
}

watch(activeTab, (value) => { if (value === 'detail' && run.value?.status === 'SUCCEEDED' && !rowsLoaded.value) void loadRows(true); });
watch([tenantId, reportKey], () => { stopPolling(); void initialize(); });
onMounted(initialize);
onBeforeUnmount(stopPolling);
</script>

<template>
  <Button label="ภาพรวมร้าน" icon="pi pi-arrow-left" text class="-ml-3 mb-2" @click="router.push(`/app/tenant/${tenantId}`)" />
  <div class="page-header">
    <div><p class="report-eyebrow">EXECUTIVE REPORT</p><h1 class="page-title">{{ definition?.label ?? reportKey }}</h1><p class="page-subtitle">{{ tenant?.name }} · แสดงเวลาไทย (Asia/Bangkok) · ดึง SQL ใหม่เมื่อกดอัปเดต</p></div>
    <Tag v-if="run" :severity="statusSeverity" :value="statusLabel" />
  </div>

  <section class="surface-card report-filter p-4 mb-4" aria-label="ตัวกรองรายงาน">
    <div class="grid grid-cols-1 md:grid-cols-[14rem_1fr_1fr_auto] gap-3 items-end">
      <div class="grid gap-2"><label for="report-period">ช่วงข้อมูล</label><Select input-id="report-period" v-model="input.periodPreset" :options="periodOptions" option-label="label" option-value="value" fluid /></div>
      <div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-from">จากวันที่</label><DatePicker input-id="report-date-from" v-model="input.dateFrom" date-format="dd/mm/yy" show-icon fluid /></div>
      <div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-to">ถึงวันที่</label><DatePicker input-id="report-date-to" v-model="input.dateTo" date-format="dd/mm/yy" show-icon fluid /></div>
      <div class="flex gap-2"><Button label="อัปเดตข้อมูล" icon="pi pi-refresh" :loading="loading" @click="startRun" /><Button v-if="active" icon="pi pi-stop" severity="danger" outlined aria-label="ยกเลิกการสร้างรายงาน" @click="cancel" /></div>
    </div>
  </section>

  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <section v-if="loading" class="surface-card report-panel p-6 mb-4" aria-live="polite"><div class="flex items-center gap-4"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="6" /><div><h2 class="text-lg m-0">{{ statusLabel || 'กำลังส่งคำขอ' }}</h2><p class="text-muted-color mt-1 mb-0">กำลังดึงข้อมูลจาก SML ของ {{ tenant?.name }}<span v-if="run?.queuePosition"> · ลำดับคิว {{ run.queuePosition }}</span></p></div></div><ProgressBar mode="indeterminate" style="height: .35rem" class="mt-5" /></section>

  <Tabs v-if="dashboard && run?.status === 'SUCCEEDED'" v-model:value="activeTab" class="report-tabs">
    <TabList><Tab value="overview"><i class="pi pi-chart-bar mr-2" />ภาพรวมและกราฟ</Tab><Tab value="detail"><i class="pi pi-table mr-2" />ข้อมูลรายละเอียด</Tab></TabList>
    <TabPanels>
      <TabPanel value="overview">
        <Message v-if="dashboard.quality.status === 'WARNING'" severity="warn" :closable="false" class="mb-4">ข้อมูลหลักพร้อมใช้งาน แต่ไม่มีช่วงเปรียบเทียบบางส่วน</Message>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div><strong>{{ periodLabel(dashboard.period.preset) }}</strong><span class="text-sm text-muted-color ml-2">{{ dashboard.period.dateFrom }} ถึง {{ dashboard.period.dateTo }}</span></div><span class="text-sm text-muted-color"><i class="pi pi-clock mr-2" />สร้าง {{ formatDateTime(dashboard.generatedAt) }}</span></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <article v-for="metric in dashboard.kpis" :key="metric.key" class="surface-card report-kpi"><span class="text-sm text-muted-color">{{ metric.label }}</span><strong>{{ formatDashboardValue(metric.value, metric.unit) }}</strong><span v-if="metric.comparison.availability === 'AVAILABLE'" class="text-xs text-muted-color"><i :class="metric.comparison.direction === 'UP' ? 'pi pi-arrow-up-right' : metric.comparison.direction === 'DOWN' ? 'pi pi-arrow-down-right' : 'pi pi-minus'" /> {{ formatDashboardValue(metric.comparison.delta, metric.unit) }} จากช่วงก่อน</span><span v-else class="text-xs text-muted-color">ไม่มีข้อมูลช่วงก่อนสำหรับเปรียบเทียบ</span></article>
        </div>
        <div class="grid grid-cols-1 2xl:grid-cols-2 gap-5"><article v-for="visualization in dashboard.visualizations" :key="visualization.key" class="surface-card report-panel p-5"><h2 class="chart-title">{{ visualization.title }}</h2><ExecutiveChart :visualization="visualization" /></article></div>
        <div v-if="!dashboard.visualizations.length" class="surface-card report-panel p-8 text-center text-muted-color"><i class="pi pi-chart-bar text-3xl" /><p class="mb-0">ช่วงนี้ไม่มีข้อมูลเพียงพอสำหรับสร้างกราฟ</p></div>
      </TabPanel>
      <TabPanel value="detail">
        <div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><h2 class="text-lg font-semibold m-0">ข้อมูลจาก SQL</h2><p class="text-sm text-muted-color mt-1 mb-0">{{ run.rowCount.toLocaleString('th-TH') }} แถว · เก็บข้อมูลรายละเอียดชั่วคราว 24 ชั่วโมง</p></div><Tag v-if="run.isTruncated" severity="warn" value="ผลลัพธ์ถูกจำกัดตามจำนวนแถวสูงสุด" /></div>
        <div class="surface-card report-panel overflow-hidden"><div class="hidden md:block"><DataTable :value="rows" :loading="loadingRows" scrollable striped-rows><Column v-for="column in columns" :key="column" :field="column" :header="metricLabel(column)"><template #body="{ data }"><span class="safe-wrap metric-value">{{ formatMetric(data[column]) }}</span></template></Column><template #empty><div class="py-8 text-center text-muted-color">{{ loadingRows ? 'กำลังโหลดข้อมูล' : 'รายงานนี้ไม่มีข้อมูลในช่วงที่เลือก' }}</div></template></DataTable></div><div class="md:hidden p-3 grid gap-3" aria-label="รายละเอียดรายงานแบบมือถือ"><article v-for="(row, rowIndex) in rows" :key="rowIndex" class="mobile-row"><div v-for="column in columns" :key="column" class="flex items-start justify-between gap-4"><span class="text-xs text-muted-color safe-wrap">{{ metricLabel(column) }}</span><strong class="text-sm text-right metric-value safe-wrap">{{ formatMetric(row[column]) }}</strong></div></article><div v-if="!loadingRows && !rows.length" class="py-8 text-center text-muted-color">รายงานนี้ไม่มีข้อมูลในช่วงที่เลือก</div></div><div v-if="hasMore" class="p-4 text-center border-t border-surface"><Button label="โหลดอีก 100 แถว" icon="pi pi-angle-down" outlined :loading="loadingRows" @click="loadRows(false)" /></div></div>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<style scoped>
.report-eyebrow { margin: 0 0 .35rem; color: var(--primary-color); font-size: .75rem; font-weight: 700; letter-spacing: .1em; }
.report-filter, .report-panel { border-radius: var(--content-border-radius); }
.report-tabs :deep(.p-tabpanels) { padding: 1.25rem 0 0; background: transparent; }
.report-kpi { display: grid; gap: .55rem; min-height: 7.5rem; padding: 1.15rem; border-radius: var(--content-border-radius); }
.report-kpi strong { font-size: 1.5rem; line-height: 1.1; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.chart-title { margin: 0 0 .75rem; font-size: 1.05rem; }
.mobile-row { padding: 1rem; display: grid; gap: .65rem; border: 1px solid var(--surface-border); border-radius: var(--content-border-radius); }
</style>
