<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import ExecutiveChart from '@/components/dashboard/ExecutiveChart.vue';
import { ApiError, viewerApi, type DashboardRefresh, type DashboardSnapshot, type ExecutiveOverview, type ReportKey } from '@/api';
import { newIdempotencyKey } from '@/api/client';
import { useViewerSession } from '@/stores/viewer';
import { buildExecutiveKpis, formatDashboardValue, periodLabel, snapshotForReport } from '@/utils/dashboard';
import { errorMessage, formatDateTime } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const { state, ensureReports, selectTenant } = useViewerSession();
const overview = ref<ExecutiveOverview>();
const refresh = ref<DashboardRefresh>();
const loading = ref(true);
const refreshing = ref(false);
const error = ref('');
let pollTimer: number | undefined;
let pollCount = 0;
let generation = 0;
let pollDeadline = 0;
let pollInFlight = false;
let pageController: AbortController | undefined;
let pollController: AbortController | undefined;
let refreshActionKey = '';

const tenantId = computed(() => String(route.params.tenantId));
const tenant = computed(() => state.tenants.find((item) => item.id === tenantId.value));
const reports = computed(() => state.reportsByTenant[tenantId.value] ?? []);
const snapshots = computed(() => overview.value?.items ?? []);
const kpis = computed(() => buildExecutiveKpis(snapshots.value));
const missingReportCount = computed(() => Math.max(0, reports.value.length - new Set(snapshots.value.map((item) => item.dashboard.reportKey)).size));
const newestGeneratedAt = computed(() => snapshots.value.reduce<string | undefined>((latest, item) => !latest || Date.parse(item.dashboard.generatedAt) > Date.parse(latest) ? item.dashboard.generatedAt : latest, undefined));
const featuredCharts = computed(() => {
  const choices: Array<[ReportKey, string]> = [
    ['sales_goods_services', 'sales_trend'],
    ['gross_profit_by_product', 'gross_profit_ranking'],
    ['stock_balance', 'stock_value_ranking'],
    ['cash_bank_receipts', 'cash_receipt_trend']
  ];
  const selected: { snapshot: DashboardSnapshot; visualization: DashboardSnapshot['dashboard']['visualizations'][number] }[] = [];
  for (const [reportKey, preferredKey] of choices) {
    const snapshot = snapshotForReport(snapshots.value, reportKey);
    const visualization = snapshot?.dashboard.visualizations.find((item) => item.key === preferredKey) ?? snapshot?.dashboard.visualizations[0];
    if (snapshot && visualization) selected.push({ snapshot, visualization });
  }
  if (selected.length < 2) {
    for (const snapshot of snapshots.value) {
      const visualization = snapshot.dashboard.visualizations[0];
      if (visualization && !selected.some((item) => item.visualization.key === visualization.key)) selected.push({ snapshot, visualization });
      if (selected.length >= 4) break;
    }
  }
  return selected.slice(0, 4);
});
const refreshPercent = computed(() => refresh.value?.total ? Math.round(((refresh.value.completed + refresh.value.failed) / refresh.value.total) * 100) : 0);

async function loadOverview() {
  const context = ++generation;
  const selectedTenantId = tenantId.value;
  pageController?.abort('new-overview'); pageController = new AbortController(); stopPolling();
  loading.value = true; error.value = '';
  try {
    selectTenant(selectedTenantId);
    await ensureReports(selectedTenantId, true, pageController.signal);
    const result = await viewerApi.overview(selectedTenantId, pageController.signal);
    if (context === generation && selectedTenantId === tenantId.value) overview.value = result;
  } catch (cause) { if (!isCancelled(cause) && context === generation) error.value = errorMessage(cause); }
  finally { if (context === generation) loading.value = false; }
}

async function startRefresh() {
  if (refreshing.value) return;
  const context = generation;
  const selectedTenantId = tenantId.value;
  stopPolling(); refreshing.value = true; error.value = ''; pollCount = 0; refreshActionKey ||= newIdempotencyKey('dashboard-refresh');
  try {
    const created = await viewerApi.createDashboardRefresh(selectedTenantId, refreshActionKey);
    if (context !== generation || selectedTenantId !== tenantId.value) return;
    refresh.value = created; refreshActionKey = ''; pollDeadline = Date.now() + 12 * 60_000; schedulePoll(context);
  } catch (cause) {
    if (!isCancelled(cause) && context === generation) { refreshing.value = false; error.value = errorMessage(cause); }
    if (!(cause instanceof ApiError) || !cause.retryable) refreshActionKey = '';
  }
}

function schedulePoll(context: number) {
  stopPolling();
  const delay = document.visibilityState === 'hidden' ? 5000 : Math.min(1500 + pollCount * 150, 3500);
  pollTimer = window.setTimeout(() => void pollRefresh(context), delay);
}

async function pollRefresh(context: number) {
  if (!refresh.value || pollInFlight || context !== generation) return;
  if (Date.now() >= pollDeadline) { refreshing.value = false; error.value = 'การอัปเดตใช้เวลานานกว่าปกติ กรุณากลับมาตรวจสอบอีกครั้ง'; return; }
  const selectedTenantId = tenantId.value; const refreshId = refresh.value.id;
  pollInFlight = true; pollController = new AbortController();
  try {
    const latest = await viewerApi.dashboardRefresh(selectedTenantId, refreshId, pollController.signal);
    if (context !== generation || selectedTenantId !== tenantId.value || refresh.value?.id !== refreshId) return;
    refresh.value = latest; pollCount++;
    if (['SUCCEEDED', 'PARTIAL', 'FAILED'].includes(refresh.value.status)) {
      refreshing.value = false; await loadOverview(); return;
    }
    schedulePoll(context);
  } catch (cause) { if (!isCancelled(cause) && context === generation) { refreshing.value = false; error.value = errorMessage(cause); } }
  finally { pollInFlight = false; pollController = undefined; }
}

function openReport(reportKey: ReportKey) { void router.push(`/app/tenant/${tenantId.value}/report/${reportKey}`); }
function stopPolling() { if (pollTimer) window.clearTimeout(pollTimer); pollTimer = undefined; pollController?.abort('poll-stopped'); pollController = undefined; }
function isCancelled(cause: unknown) { return cause instanceof ApiError && cause.code === 'CANCELLED'; }
function handleVisibilityChange() {
  if (document.visibilityState === 'visible' && refreshing.value && refresh.value && !pollInFlight) {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = undefined; void pollRefresh(generation);
  }
}

onMounted(() => { document.addEventListener('visibilitychange', handleVisibilityChange); void loadOverview(); });
onBeforeUnmount(() => { generation++; document.removeEventListener('visibilitychange', handleVisibilityChange); pageController?.abort('unmounted'); stopPolling(); });
watch(tenantId, () => { refresh.value = undefined; refreshing.value = false; void loadOverview(); });
</script>

<template>
  <div class="page-header executive-heading">
    <div><p class="eyebrow">EXECUTIVE OVERVIEW</p><h1 class="page-title">ภาพรวม {{ tenant?.name }}</h1><p class="page-subtitle">ตัวเลขสำคัญและแนวโน้มจากข้อมูล SML ของร้าน</p></div>
    <div class="flex flex-wrap items-center gap-3"><span v-if="newestGeneratedAt" class="text-sm text-muted-color"><i class="pi pi-clock mr-2" />อัปเดตล่าสุด {{ formatDateTime(newestGeneratedAt) }}</span><Button label="อัปเดตข้อมูลทั้งหมด" icon="pi pi-refresh" :loading="refreshing" :disabled="loading || !reports.length" @click="startRefresh" /></div>
  </div>

  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }} <Button label="ลองโหลดอีกครั้ง" text size="small" @click="loadOverview" /></Message>
  <div v-if="refreshing" class="surface-card executive-panel p-4 mb-4" aria-live="polite"><div class="flex justify-between gap-4 mb-2"><span class="font-medium">กำลังอัปเดต {{ refresh?.completed ?? 0 }} จาก {{ refresh?.total ?? reports.length }} รายงาน</span><span class="metric-value">{{ refreshPercent }}%</span></div><ProgressBar :value="refreshPercent" :show-value="false" style="height: .45rem" /><p class="text-xs text-muted-color mb-0 mt-2">ระบบรันทีละรายงานเพื่อลดภาระฐานข้อมูลของร้าน คุณออกจากหน้านี้ได้โดยไม่ยกเลิกงาน</p></div>
  <Message v-if="!loading && missingReportCount" severity="warn" :closable="false" class="mb-4">ยังไม่มีข้อมูลล่าสุด {{ missingReportCount }} รายงาน — กด “อัปเดตข้อมูลทั้งหมด” เพื่อดึงจาก SQL ของร้าน</Message>

  <div v-if="loading" class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5"><Skeleton v-for="index in 4" :key="index" height="9rem" /></div>
  <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
    <button v-for="item in kpis" :key="item.key" type="button" class="executive-kpi surface-card" @click="openReport(item.reportKey)"><span class="kpi-icon"><i :class="item.icon" /></span><span class="kpi-copy"><span class="kpi-label">{{ item.label }}</span><strong class="kpi-value">{{ formatDashboardValue(item.metric?.value, item.metric?.unit ?? 'THB') }}</strong><span v-if="item.metric?.comparison.availability === 'AVAILABLE'" class="kpi-comparison"><i :class="item.metric.comparison.direction === 'UP' ? 'pi pi-arrow-up-right' : item.metric.comparison.direction === 'DOWN' ? 'pi pi-arrow-down-right' : 'pi pi-minus'" /> {{ formatDashboardValue(item.metric.comparison.delta, item.metric.unit) }} จากช่วงก่อน</span><span v-else class="kpi-comparison">{{ item.metric ? 'ไม่มีช่วงเปรียบเทียบ' : 'รอการอัปเดตข้อมูล' }}</span></span><i class="pi pi-chevron-right kpi-link" /></button>
  </div>

  <div v-if="featuredCharts.length" class="grid grid-cols-1 2xl:grid-cols-2 gap-5">
    <article v-for="item in featuredCharts" :key="`${item.snapshot.runId}-${item.visualization.key}`" class="surface-card executive-panel p-5"><div class="chart-heading"><div><h2>{{ item.visualization.title }}</h2><p>{{ periodLabel(item.snapshot.dashboard.period.preset) }} · {{ formatDateTime(item.snapshot.dashboard.generatedAt) }}</p></div><Button icon="pi pi-arrow-up-right" text rounded aria-label="เปิดรายงาน" @click="openReport(item.snapshot.dashboard.reportKey)" /></div><ExecutiveChart :visualization="item.visualization" compact /></article>
  </div>
  <div v-else-if="!loading" class="surface-card executive-panel empty-overview"><i class="pi pi-chart-bar" /><h2>พร้อมสร้างภาพรวมผู้บริหาร</h2><p>กด “อัปเดตข้อมูลทั้งหมด” เพื่อดึง SQL ล่าสุดและสร้างกราฟตามสิทธิ์ของคุณ</p><Button label="อัปเดตข้อมูลทั้งหมด" icon="pi pi-refresh" :disabled="!reports.length" @click="startRefresh" /></div>
</template>

<style scoped>
.eyebrow { margin: 0 0 .35rem; color: var(--primary-color); font-size: .75rem; font-weight: 700; letter-spacing: .1em; }
.executive-heading { align-items: center; }
.executive-panel { border-radius: var(--content-border-radius); }
.executive-kpi { position: relative; display: flex; align-items: flex-start; gap: 1rem; min-height: 9rem; padding: 1.25rem; color: inherit; background: var(--surface-card); border-radius: var(--content-border-radius); text-align: left; cursor: pointer; transition: border-color .2s, transform .2s; }
.executive-kpi:hover { border-color: var(--primary-color); transform: translateY(-1px); }
.kpi-icon { display: grid; place-items: center; flex: 0 0 2.75rem; height: 2.75rem; border-radius: var(--content-border-radius); background: var(--p-primary-50); color: var(--primary-color); font-size: 1.1rem; }
.kpi-copy { display: grid; gap: .45rem; min-width: 0; }
.kpi-label { color: var(--text-color-secondary); font-size: .8rem; font-weight: 600; }
.kpi-value { font-size: clamp(1.35rem, 2.2vw, 1.75rem); line-height: 1.1; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.kpi-comparison { color: var(--text-color-secondary); font-size: .75rem; }
.kpi-link { position: absolute; top: 1.2rem; right: 1rem; color: var(--text-color-secondary); font-size: .75rem; }
.chart-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: .5rem; }
.chart-heading h2 { margin: 0; font-size: 1.05rem; }
.chart-heading p { margin: .35rem 0 0; color: var(--text-color-secondary); font-size: .75rem; }
.empty-overview { display: grid; justify-items: center; padding: 3rem 1.5rem; text-align: center; }
.empty-overview > i { color: var(--primary-color); font-size: 2.75rem; }
.empty-overview h2 { margin: 1rem 0 .4rem; }
.empty-overview p { max-width: 34rem; margin: 0 0 1.25rem; color: var(--text-color-secondary); }
@media (prefers-reduced-motion: reduce) { .executive-kpi { transition: none; } }
</style>
