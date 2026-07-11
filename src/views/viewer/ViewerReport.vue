<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import ExecutiveChart from '@/components/dashboard/ExecutiveChart.vue';
import { ApiError, reportDefinitionByKey, viewerApi, type CreateReportRunInput, type ReportDashboard, type ReportKey, type ReportRun } from '@/api';
import { newIdempotencyKey } from '@/api/client';
import { useViewerSession } from '@/stores/viewer';
import { formatDashboardValue, periodLabel } from '@/utils/dashboard';
import { errorMessage, formatDateOnly, formatDateTime, formatMetric } from '@/utils/format';
import { presentationFor, visibleReportColumns, type ReportColumnDefinition } from '@/utils/reportPresentation';
import { cleanViewerQuery, snapshotReplayInput, validSnapshotRunId } from '@/utils/viewerSnapshot';

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
const rowsUnavailable = ref(false);
const activeTab = ref('overview');
const selectedColumnKeys = ref<string[]>([]);
const expandedMobileRows = ref(new Set<string>());
const snapshotMode = ref(false);
const snapshotMissing = ref(false);
const loading = ref(false);
const loadingRows = ref(false);
const error = ref('');
let pollTimer: number | undefined;
let pollCount = 0;
let generation = 0;
let pollDeadline = 0;
let pollInFlight = false;
let initializeController: AbortController | undefined;
let pollController: AbortController | undefined;
let rowsController: AbortController | undefined;
let runActionKey = '';

const active = computed(() => !!run.value && ['QUEUED', 'CLAIMED', 'RUNNING'].includes(run.value.status));
const snapshotRunId = computed(() => validSnapshotRunId(route.query.snapshotRunId));
const statusLabel = computed(() => {
  if (snapshotMode.value && dashboard.value) return 'Snapshot พร้อมใช้งาน';
  const labels: Record<string, string> = { QUEUED: 'รอคิว', CLAIMED: 'กำลังเตรียม', RUNNING: 'กำลังดึงข้อมูล', SUCCEEDED: 'พร้อมใช้งาน', FAILED: 'ไม่สำเร็จ', CANCELLED: 'ยกเลิกแล้ว', EXPIRED: 'หมดอายุ' };
  return run.value ? labels[run.value.status] ?? run.value.status : '';
});
const statusSeverity = computed(() => snapshotMode.value && dashboard.value ? 'success' : run.value?.status === 'SUCCEEDED' ? 'success' : run.value?.status === 'FAILED' ? 'danger' : active.value ? 'info' : 'secondary');
const snapshotRowsUnavailable = computed(() => snapshotMode.value && (rowsUnavailable.value || run.value?.status === 'EXPIRED'));
const columnOptions = computed(() => presentationFor(reportKey.value, columns.value));
const displayedColumns = computed(() => visibleReportColumns(reportKey.value, columns.value, selectedColumnKeys.value));
const mobileSummaryColumns = computed(() => displayedColumns.value.filter((column) => column.mobilePriority >= 4).slice(0, 6));
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
  if (loading.value) return;
  if (!definition.value) { error.value = 'ไม่พบรายงานหรือคุณไม่มีสิทธิ์เปิดรายงานนี้'; return; }
  if (input.periodPreset === 'CUSTOM' && (!input.dateFrom || !input.dateTo)) { error.value = 'กรุณาเลือกวันที่เริ่มต้นและสิ้นสุด'; return; }
  if (input.periodPreset === 'CUSTOM' && formatDateOnly(input.dateTo!) < formatDateOnly(input.dateFrom!)) { error.value = 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'; return; }
  if (snapshotMode.value || route.query.snapshotRunId !== undefined) await leaveSnapshotMode();
  const context = ++generation;
  const selectedTenantId = tenantId.value;
  const selectedReportKey = reportKey.value;
  stopPolling(); rowsController?.abort('new-run'); rowsController = undefined;
  loading.value = true; error.value = ''; dashboard.value = undefined; run.value = undefined; activeTab.value = 'overview';
  rows.value = []; columns.value = []; selectedColumnKeys.value = []; expandedMobileRows.value = new Set(); nextCursor.value = undefined; hasMore.value = false; rowsLoaded.value = false; rowsUnavailable.value = false; pollCount = 0;
  const payload: CreateReportRunInput = { periodPreset: input.periodPreset };
  if (input.periodPreset === 'CUSTOM') { payload.dateFrom = formatDateOnly(input.dateFrom!); payload.dateTo = formatDateOnly(input.dateTo!); }
  runActionKey ||= newIdempotencyKey('viewer-run');
  try {
    const created = await viewerApi.createRun(selectedTenantId, selectedReportKey, payload, runActionKey);
    if (!isCurrent(context, selectedTenantId, selectedReportKey)) return;
    run.value = created; runActionKey = ''; pollDeadline = Date.now() + 12 * 60_000; schedulePoll(context);
  } catch (cause) {
    if (!isCurrent(context, selectedTenantId, selectedReportKey) || isCancelled(cause)) return;
    if (!(cause instanceof ApiError) || !cause.retryable) runActionKey = '';
    error.value = errorMessage(cause); loading.value = false;
  }
}

async function leaveSnapshotMode() {
  snapshotMode.value = false; snapshotMissing.value = false;
  if (route.query.snapshotRunId !== undefined) {
    const query = cleanViewerQuery(route.query);
    delete query.snapshotRunId;
    await router.replace({ path: route.path, query, hash: route.hash });
  }
}

function applyRunPeriod(item: ReportRun) {
  input.periodPreset = item.periodPreset as CreateReportRunInput['periodPreset'];
  input.dateFrom = item.dateFrom ? new Date(`${item.dateFrom}T00:00:00`) : null;
  input.dateTo = item.dateTo ? new Date(`${item.dateTo}T00:00:00`) : null;
}

async function loadSnapshot(context: number, selectedTenantId: string, selectedReportKey: ReportKey, selectedRunId: string) {
  snapshotMode.value = true; snapshotMissing.value = false; loading.value = true;
  dashboard.value = undefined; run.value = undefined; activeTab.value = 'overview'; error.value = '';
  rows.value = []; columns.value = []; selectedColumnKeys.value = []; expandedMobileRows.value = new Set(); nextCursor.value = undefined; hasMore.value = false; rowsLoaded.value = false; rowsUnavailable.value = false;
  const [runResult, dashboardResult] = await Promise.allSettled([
    viewerApi.run(selectedTenantId, selectedReportKey, selectedRunId, initializeController?.signal),
    viewerApi.dashboard(selectedTenantId, selectedReportKey, selectedRunId, initializeController?.signal)
  ]);
  if (!isCurrent(context, selectedTenantId, selectedReportKey)) return;
  if (runResult.status === 'rejected') throw runResult.reason;
  run.value = runResult.value; applyRunPeriod(runResult.value);
  if (dashboardResult.status === 'fulfilled') dashboard.value = dashboardResult.value;
  else if (dashboardResult.reason instanceof ApiError && dashboardResult.reason.status === 404) snapshotMissing.value = true;
  else throw dashboardResult.reason;
  loading.value = false;
}

async function replaySnapshot() {
  if (!run.value) return;
  const payload = snapshotReplayInput(reportKey.value, run.value);
  input.periodPreset = payload.periodPreset;
  input.dateFrom = payload.dateFrom ? new Date(`${payload.dateFrom}T00:00:00`) : null;
  input.dateTo = payload.dateTo ? new Date(`${payload.dateTo}T00:00:00`) : null;
  await startRun();
}

function schedulePoll(context: number) {
  stopPolling();
  const delay = document.visibilityState === 'hidden' ? 5000 : Math.min(1200 + pollCount * 100, 3000);
  pollTimer = window.setTimeout(() => void poll(context), delay);
}

async function poll(context: number) {
  if (!run.value || pollInFlight || context !== generation) return;
  if (Date.now() >= pollDeadline) { loading.value = false; error.value = 'รายงานใช้เวลานานกว่าปกติ คุณสามารถออกจากหน้านี้แล้วกลับมาตรวจสอบอีกครั้ง'; return; }
  const selectedTenantId = tenantId.value;
  const selectedReportKey = reportKey.value;
  const selectedRunId = run.value.id;
  pollInFlight = true; pollController = new AbortController();
  try {
    const latest = await viewerApi.run(selectedTenantId, selectedReportKey, selectedRunId, pollController.signal);
    if (!isCurrent(context, selectedTenantId, selectedReportKey) || run.value?.id !== selectedRunId) return;
    run.value = latest; pollCount++;
    if (run.value.status === 'SUCCEEDED') { await loadDashboard(); loading.value = false; return; }
    if (['FAILED', 'CANCELLED', 'EXPIRED'].includes(run.value.status)) { loading.value = false; error.value = run.value.safeErrorMessage || 'สร้างรายงานไม่สำเร็จ กรุณาลองใหม่'; return; }
    schedulePoll(context);
  } catch (cause) {
    if (!isCancelled(cause) && isCurrent(context, selectedTenantId, selectedReportKey)) { loading.value = false; error.value = errorMessage(cause); }
  } finally { pollInFlight = false; pollController = undefined; }
}

async function loadDashboard() {
  if (!run.value) return;
  const context = generation; const selectedTenantId = tenantId.value; const selectedReportKey = reportKey.value; const selectedRunId = run.value.id;
  try {
    const result = await viewerApi.dashboard(selectedTenantId, selectedReportKey, selectedRunId, pollController?.signal);
    if (isCurrent(context, selectedTenantId, selectedReportKey) && run.value?.id === selectedRunId) dashboard.value = result;
  } catch (cause) {
    if (!isCancelled(cause) && context === generation) {
      if (snapshotMode.value && cause instanceof ApiError && cause.code === 'REPORT_ROWS_EXPIRED') rowsUnavailable.value = true;
      else error.value = errorMessage(cause);
    }
  }
}

async function loadRows(reset = false) {
  if (!run.value || loadingRows.value) return;
  rowsController?.abort('new-page'); rowsController = new AbortController();
  const context = generation; const selectedTenantId = tenantId.value; const selectedReportKey = reportKey.value; const selectedRunId = run.value.id;
  const requestedCursor = reset ? undefined : nextCursor.value;
  loadingRows.value = true;
  try {
    const page = await viewerApi.rows(selectedTenantId, selectedReportKey, selectedRunId, requestedCursor, 25, rowsController.signal);
    if (!isCurrent(context, selectedTenantId, selectedReportKey) || run.value?.id !== selectedRunId) return;
    const keyedRows = page.data.map((row, index) => ({ ...row, __rowKey: `${selectedRunId}:${requestedCursor ?? 'first'}:${index}` }));
    rows.value = reset ? keyedRows : [...rows.value, ...keyedRows];
    columns.value = [...new Set([...columns.value, ...page.columns])];
    if (reset) selectedColumnKeys.value = visibleReportColumns(selectedReportKey, columns.value).map((column) => column.key);
    nextCursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; rowsLoaded.value = true;
  } catch (cause) { if (!isCancelled(cause) && context === generation) error.value = errorMessage(cause); }
  finally { if (context === generation) loadingRows.value = false; }
}

async function cancel() {
  if (!run.value) return;
  try { run.value = await viewerApi.cancelRun(tenantId.value, reportKey.value, run.value.id); loading.value = false; stopPolling(); toast.add({ severity: 'info', summary: 'ยกเลิกการสร้างรายงานแล้ว', life: 2500 }); }
  catch (cause) { error.value = errorMessage(cause); }
}

function stopPolling() { if (pollTimer) window.clearTimeout(pollTimer); pollTimer = undefined; pollController?.abort('poll-stopped'); pollController = undefined; }
function stopLifecycle() { generation++; stopPolling(); initializeController?.abort('route-changed'); rowsController?.abort('route-changed'); initializeController = undefined; rowsController = undefined; pollInFlight = false; }
function isCancelled(cause: unknown) { return cause instanceof ApiError && cause.code === 'CANCELLED'; }
function isCurrent(context: number, selectedTenantId: string, selectedReportKey: ReportKey) { return context === generation && tenantId.value === selectedTenantId && reportKey.value === selectedReportKey; }
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && loading.value && active.value && !pollInFlight) {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = undefined; void poll(generation);
  }
}
function mobileColumns(row: Record<string, unknown>): ReportColumnDefinition[] {
  return expandedMobileRows.value.has(String(row.__rowKey)) ? displayedColumns.value : mobileSummaryColumns.value;
}
function toggleMobileRow(row: Record<string, unknown>) {
  const key = String(row.__rowKey); const next = new Set(expandedMobileRows.value);
  if (next.has(key)) next.delete(key); else next.add(key);
  expandedMobileRows.value = next;
}
async function initialize() {
  stopLifecycle();
  const context = generation;
  const selectedTenantId = tenantId.value;
  const selectedReportKey = reportKey.value;
  initializeController = new AbortController();
  error.value = '';
  try {
    selectTenant(selectedTenantId);
    const permittedReports = await ensureReports(selectedTenantId, false, initializeController.signal);
    if (!isCurrent(context, selectedTenantId, selectedReportKey)) return;
    if (!permittedReports.some((item) => item.reportKey === selectedReportKey)) {
      error.value = 'คุณไม่มีสิทธิ์เปิดรายงานนี้ กรุณาเลือกจากเมนูรายงาน';
      return;
    }
    if (route.query.snapshotRunId !== undefined && !snapshotRunId.value) {
      error.value = 'ลิงก์ Snapshot ไม่ถูกต้อง กรุณาเปิดจากข้อความ LINE อีกครั้ง'; loading.value = false; return;
    }
    if (snapshotRunId.value) await loadSnapshot(context, selectedTenantId, selectedReportKey, snapshotRunId.value);
    else { snapshotMode.value = false; snapshotMissing.value = false; setDefaultPeriod(); await startRun(); }
  } catch (cause) { if (!isCancelled(cause) && context === generation) { error.value = errorMessage(cause); loading.value = false; } }
}

watch(activeTab, (value) => { if (value === 'detail' && run.value?.status === 'SUCCEEDED' && !rowsLoaded.value && !rowsUnavailable.value) void loadRows(true); });
watch([tenantId, reportKey], () => void initialize());
onMounted(() => { document.addEventListener('visibilitychange', handleVisibilityChange); void initialize(); });
onBeforeUnmount(() => { document.removeEventListener('visibilitychange', handleVisibilityChange); stopLifecycle(); });
</script>

<template>
  <Button label="ภาพรวมร้าน" icon="pi pi-arrow-left" text class="-ml-3 mb-2" @click="router.push(`/app/tenant/${tenantId}`)" />
  <div class="page-header">
    <div><p class="report-eyebrow">EXECUTIVE REPORT</p><h1 class="page-title">{{ definition?.label ?? reportKey }}</h1><p class="page-subtitle">{{ tenant?.name }} · แสดงเวลาไทย (Asia/Bangkok) · ดึง SQL ใหม่เมื่อกดอัปเดต</p></div>
    <div class="flex flex-wrap gap-2"><Tag v-if="snapshotMode" severity="info" value="ข้อมูลจาก LINE" /><Tag v-if="run" :severity="statusSeverity" :value="statusLabel" /></div>
  </div>

  <section class="card report-filter" aria-label="ตัวกรองรายงาน">
    <div class="grid grid-cols-1 md:grid-cols-[14rem_1fr_1fr_auto] gap-3 items-end">
      <div class="grid gap-2"><label for="report-period">ช่วงข้อมูล</label><Select input-id="report-period" v-model="input.periodPreset" :options="periodOptions" option-label="label" option-value="value" fluid /></div>
      <div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-from">จากวันที่</label><DatePicker input-id="report-date-from" v-model="input.dateFrom" date-format="dd/mm/yy" show-icon fluid /></div>
      <div v-if="input.periodPreset === 'CUSTOM'" class="grid gap-2"><label for="report-date-to">ถึงวันที่</label><DatePicker input-id="report-date-to" v-model="input.dateTo" date-format="dd/mm/yy" show-icon fluid /></div>
      <div class="flex gap-2"><Button label="อัปเดตข้อมูล" icon="pi pi-refresh" :loading="loading" :disabled="loading" @click="startRun" /><Button v-if="active" icon="pi pi-stop" severity="danger" outlined aria-label="ยกเลิกการสร้างรายงาน" @click="cancel" /></div>
    </div>
  </section>

  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <Message v-if="snapshotMissing && run" severity="warn" :closable="false" class="mb-4"><div class="flex flex-wrap items-center justify-between gap-3"><span>ข้อมูลสรุปชุดนี้หมดอายุแล้ว กรุณาดึงข้อมูลใหม่จากฐานร้าน</span><Button :label="reportKey === 'stock_reorder' ? 'ดูสถานะปัจจุบัน' : 'ดึงข้อมูลช่วงเดิมใหม่'" icon="pi pi-refresh" size="small" @click="replaySnapshot" /></div></Message>
  <section v-if="loading" class="card report-panel" aria-live="polite"><div class="flex flex-col items-center text-center gap-3 py-3"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="6" /><div><h2 class="text-lg m-0">{{ snapshotMode ? 'กำลังเปิดข้อมูลจาก LINE' : statusLabel || 'กำลังส่งคำขอ' }}</h2><p class="text-muted-color mt-1 mb-0">{{ snapshotMode ? 'กำลังโหลด Snapshot ที่ใช้สร้างข้อความ โดยไม่ดึง SQL ใหม่' : `กำลังดึงข้อมูลจาก SML ของ ${tenant?.name ?? ''}` }}<span v-if="!snapshotMode && run?.queuePosition"> · ลำดับคิว {{ run.queuePosition }}</span></p></div></div><ProgressBar mode="indeterminate" style="height: .35rem" class="mt-4" /></section>

  <Tabs v-if="dashboard && run" v-model:value="activeTab" class="report-tabs">
    <TabList><Tab value="overview"><i class="pi pi-chart-bar mr-2" />ภาพรวมและกราฟ</Tab><Tab value="detail"><i class="pi pi-table mr-2" />ข้อมูลรายละเอียด</Tab></TabList>
    <TabPanels>
      <TabPanel value="overview">
        <Message v-if="dashboard.quality.status === 'WARNING'" severity="warn" :closable="false" class="mb-4">ข้อมูลหลักพร้อมใช้งาน แต่ไม่มีช่วงเปรียบเทียบบางส่วน</Message>
        <div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div><strong>{{ periodLabel(dashboard.period.preset) }}</strong><span class="text-sm text-muted-color ml-2">{{ dashboard.period.dateFrom }} ถึง {{ dashboard.period.dateTo }}</span></div><span class="text-sm text-muted-color"><i class="pi pi-clock mr-2" />สร้าง {{ formatDateTime(dashboard.generatedAt) }}</span></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
          <article v-for="metric in dashboard.kpis" :key="metric.key" class="card dashboard-card report-kpi"><span class="text-sm text-muted-color">{{ metric.label }}</span><strong>{{ formatDashboardValue(metric.value, metric.unit) }}</strong><span v-if="metric.comparison.availability === 'AVAILABLE'" class="text-xs text-muted-color"><i :class="metric.comparison.direction === 'UP' ? 'pi pi-arrow-up-right' : metric.comparison.direction === 'DOWN' ? 'pi pi-arrow-down-right' : 'pi pi-minus'" /> {{ formatDashboardValue(metric.comparison.delta, metric.unit) }} จากช่วงก่อน</span><span v-else class="text-xs text-muted-color">ไม่มีข้อมูลช่วงก่อนสำหรับเปรียบเทียบ</span></article>
        </div>
        <div class="grid grid-cols-1 2xl:grid-cols-2 gap-5"><article v-for="visualization in dashboard.visualizations" :key="visualization.key" class="card dashboard-card report-panel"><h2 class="chart-title">{{ visualization.title }}</h2><ExecutiveChart :visualization="visualization" /></article></div>
        <div v-if="!dashboard.visualizations.length" class="card report-panel text-center text-muted-color"><i class="pi pi-chart-bar text-3xl" /><p class="mb-0">ช่วงนี้ไม่มีข้อมูลเพียงพอสำหรับสร้างกราฟ</p></div>
      </TabPanel>
      <TabPanel value="detail">
        <Message v-if="snapshotRowsUnavailable" severity="info" :closable="false"><div class="flex flex-wrap items-center justify-between gap-3"><span>ข้อมูลแถวรายละเอียดเป็นข้อมูลชั่วคราวและหมดอายุแล้ว แต่ Snapshot ภาพรวมจาก LINE ยังเปิดดูได้ กรุณาดึง SQL ใหม่เมื่อต้องการตรวจรายการ</span><Button :label="reportKey === 'stock_reorder' ? 'ดูสถานะปัจจุบัน' : 'ดึงข้อมูลช่วงเดิมใหม่'" icon="pi pi-refresh" size="small" @click="replaySnapshot" /></div></Message>
        <template v-else><div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><h2 class="text-lg font-semibold m-0">{{ snapshotMode ? 'ข้อมูล Snapshot จาก SQL' : 'ข้อมูลจาก SQL' }}</h2><p class="text-sm text-muted-color mt-1 mb-0">{{ run.rowCount.toLocaleString('th-TH') }} แถว · เก็บข้อมูลรายละเอียดชั่วคราว 24 ชั่วโมง</p></div><div class="flex flex-wrap gap-2"><MultiSelect v-model="selectedColumnKeys" :options="columnOptions" option-label="label" option-value="key" display="chip" filter aria-label="เลือกคอลัมน์ที่ต้องการแสดง" placeholder="เลือกคอลัมน์" class="w-full sm:w-80"><template #option="{ option }"><div class="flex items-center justify-between gap-3 w-full"><span>{{ option.label }}</span><Tag v-if="option.technical" severity="secondary" value="เทคนิค" /></div></template></MultiSelect><Tag v-if="run.isTruncated" severity="warn" value="ผลลัพธ์ถูกจำกัดตามจำนวนแถวสูงสุด" /></div></div>
        <div class="card table-card report-panel"><div class="hidden md:block"><DataTable :value="rows" :loading="loadingRows" data-key="__rowKey" scrollable striped-rows><Column v-for="column in displayedColumns" :key="column.key" :field="column.key" :header="column.label" :frozen="column.frozen" align-frozen="left"><template #body="{ data }"><span class="safe-wrap metric-value">{{ formatMetric(data[column.key]) }}</span></template></Column><template #empty><div class="py-8 text-center text-muted-color">{{ loadingRows ? 'กำลังโหลดข้อมูล' : 'รายงานนี้ไม่มีข้อมูลในช่วงที่เลือก' }}</div></template></DataTable></div><div class="md:hidden grid gap-3" aria-label="รายละเอียดรายงานแบบมือถือ"><article v-for="row in rows" :key="String(row.__rowKey)" class="mobile-row"><div v-for="column in mobileColumns(row)" :key="column.key" class="flex items-start justify-between gap-4"><span class="text-xs text-muted-color safe-wrap">{{ column.label }}</span><strong class="text-sm text-right metric-value safe-wrap">{{ formatMetric(row[column.key]) }}</strong></div><Button v-if="displayedColumns.length > mobileSummaryColumns.length" :label="expandedMobileRows.has(String(row.__rowKey)) ? 'แสดงน้อยลง' : 'ดูรายละเอียดเพิ่ม'" :icon="expandedMobileRows.has(String(row.__rowKey)) ? 'pi pi-angle-up' : 'pi pi-angle-down'" text size="small" class="justify-self-start" @click="toggleMobileRow(row)" /></article><div v-if="!loadingRows && !rows.length" class="py-8 text-center text-muted-color">รายงานนี้ไม่มีข้อมูลในช่วงที่เลือก</div></div><div v-if="hasMore" class="table-footer text-center"><Button label="โหลดอีก 25 แถว" icon="pi pi-angle-down" outlined :loading="loadingRows" @click="loadRows(false)" /></div></div></template>
      </TabPanel>
    </TabPanels>
  </Tabs>
</template>

<style scoped>
.report-eyebrow { margin: 0 0 .35rem; color: var(--primary-color); font-size: .75rem; font-weight: 700; letter-spacing: .1em; }
.report-filter, .report-panel { border-radius: var(--content-border-radius); }
.dashboard-card { margin-bottom: 0; }
.report-tabs :deep(.p-tabpanels) { padding: 1.25rem 0 0; background: transparent; }
.report-kpi { display: grid; gap: .55rem; min-height: 7.5rem; padding: 1.15rem; border-radius: var(--content-border-radius); }
.report-kpi strong { font-size: 1.5rem; line-height: 1.1; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.chart-title { margin: 0 0 .75rem; font-size: 1.05rem; }
.mobile-row { padding: 1rem; display: grid; gap: .65rem; border: 1px solid var(--surface-border); border-radius: var(--content-border-radius); }
</style>
