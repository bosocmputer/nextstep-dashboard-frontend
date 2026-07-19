<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ApiError, adminApi, type AdminReportDefinition, type ReportKey, type ReportRun, type ReportRunDetail } from '@/api';
import CursorPaginator from '@/components/admin/CursorPaginator.vue';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { loadAdminReportCatalog } from '@/stores/reportCatalog';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';
import { evidenceLevelLabel, formatDurationMs, lineImpactLabel, reportImpactLabel, transportPhaseLabel, triggerKindLabel } from '@/utils/operationalPresentation';
import { toDateFilter } from '@/utils/adminTableFilters';
import { acceptCursorPage, createCursorPagination, moveCursorPage, resetCursorPagination, resizeCursorPagination } from '@/utils/cursorPagination';

const rows = ref<ReportRun[]>([]);
const loading = ref(false);
const error = ref('');
const pagination = reactive(createCursorPagination());
const status = ref<string>();
const tenantId = ref('');
const reportKey = ref<string>();
const source = ref<string>();
const dateFrom = ref<Date>();
const dateTo = ref<Date>();
const statuses = ['QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].map((value) => ({ value, label: statusLabel(value) }));
const sources = [
  { value: 'SCHEDULE', label: 'ตารางส่ง LINE' },
  { value: 'DASHBOARD', label: 'ผู้ใช้ Dashboard' },
  { value: 'BACKGROUND', label: 'อัปเดตเบื้องหลัง' }
];
const selected = ref<ReportRun>();
const detail = ref<ReportRunDetail>();
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const reportDefinitions = ref<AdminReportDefinition[]>([]);
const reportDefinitionByKey = computed(() => new Map(reportDefinitions.value.map((item) => [item.reportKey, item])));
let loadGeneration = 0;
let controller: AbortController | undefined;
let detailController: AbortController | undefined;
let detailGeneration = 0;

async function load(reset = false) {
  if (reset) resetCursorPagination(pagination);
  loadGeneration++;
  controller?.abort(reset ? 'filters-changed' : 'page-changed');
  controller = new AbortController();
  const context = loadGeneration;
  loading.value = true; error.value = '';
  try {
    const page = await adminApi.reportRuns({
      cursor: pagination.cursor, pageSize: pagination.pageSize, tenantId: tenantId.value || undefined,
      status: status.value, reportKey: reportKey.value as ReportKey | undefined, source: source.value,
      dateFrom: toDateFilter(dateFrom.value), dateTo: toDateFilter(dateTo.value)
    }, controller.signal);
    if (context !== loadGeneration) return;
    rows.value = page.data;
    acceptCursorPage(pagination, page.page.nextCursor ?? undefined, page.page.hasMore);
  } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); }
  finally { if (context === loadGeneration) loading.value = false; }
}
function changePage(direction: 'previous' | 'next') { if (moveCursorPage(pagination, direction)) void load(); }
function changePageSize(value: number) { resizeCursorPagination(pagination, value); void load(); }
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
function failureTitle(run: ReportRun) { return run.failureSummary?.presentation.titleTh || (run.status === 'FAILED' ? 'ไม่พบรายละเอียดสาเหตุจากระบบรุ่นเดิม' : '—'); }
async function openDetail(run: ReportRun) {
  selected.value = run;
  detail.value = undefined;
  detailError.value = '';
  detailVisible.value = true;
  detailLoading.value = true;
  detailGeneration++;
  const requestGeneration = detailGeneration;
  detailController?.abort('superseded');
  detailController = new AbortController();
  try {
    const result = await adminApi.reportRun(run.id, detailController.signal);
    if (requestGeneration === detailGeneration) detail.value = result;
  } catch (cause) {
    if (requestGeneration === detailGeneration && !(cause instanceof ApiError && cause.code === 'CANCELLED')) detailError.value = errorMessage(cause);
  } finally {
    if (requestGeneration === detailGeneration) detailLoading.value = false;
  }
}
function closeDetail() {
  detailVisible.value = false;
  detailGeneration++;
  detailController?.abort('dialog-closed');
  detailController = undefined;
  detail.value = undefined;
  selected.value = undefined;
}
onMounted(() => {
  void loadAdminReportCatalog().then((catalog) => { reportDefinitions.value = catalog.data; }).catch(() => undefined);
  void load(true);
});
onBeforeUnmount(() => { controller?.abort('unmounted'); detailController?.abort('unmounted'); });
</script>

<template>
  <AppPageHeader title="การสร้างรายงาน" subtitle="ตรวจคิวและผลการทำงาน · เวลาไทย" />
  <div class="card table-card">
    <Toolbar class="mb-4 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template></Toolbar>
    <form class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-3 mb-4" aria-label="ตัวกรองประวัติการสร้างรายงาน" @submit.prevent="load(true)">
      <TenantFilterSelect v-model="tenantId" />
      <Select v-model="reportKey" aria-label="กรองรายงาน" :options="reportDefinitions" option-label="label" option-value="reportKey" show-clear placeholder="ทุกรายงาน" />
      <Select v-model="status" aria-label="กรองสถานะการสร้างรายงาน" :options="statuses" option-label="label" option-value="value" show-clear placeholder="ทุกสถานะ" />
      <Select v-model="source" aria-label="กรองแหล่งงาน" :options="sources" option-label="label" option-value="value" show-clear placeholder="ทุกแหล่งงาน" />
      <DatePicker v-model="dateFrom" aria-label="กรองวันที่เริ่มต้น" date-format="dd/mm/yy" show-icon placeholder="ตั้งแต่วันที่" />
      <DatePicker v-model="dateTo" aria-label="กรองวันที่สิ้นสุด" date-format="dd/mm/yy" show-icon placeholder="ถึงวันที่" />
      <Button type="submit" label="ใช้ตัวกรอง" icon="pi pi-filter" />
    </form>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="tenantName" header="ร้านค้า" frozen><template #body="{ data }"><span class="font-semibold">{{ data.tenantName || '—' }}</span></template></Column>
      <Column field="reportKey" header="รายงาน"><template #body="{ data }"><div class="font-medium">{{ reportDefinitionByKey.get(data.reportKey)?.label ?? data.reportKey }}</div></template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><div class="grid gap-1"><Tag class="w-fit" :severity="runSeverity(data)" :value="runStatusLabel(data)" /><small v-if="data.waitReason" class="text-muted-color">{{ waitReasonLabel(data.waitReason) }}</small><small v-if="data.retryAvailableAt" class="text-muted-color">ลองใหม่ได้หลัง {{ formatDateTime(data.retryAvailableAt) }}</small></div></template></Column>
      <Column header="สาเหตุ"><template #body="{ data }"><div class="max-w-80"><span :class="data.status === 'FAILED' ? 'font-semibold text-red-600 dark:text-red-400' : 'text-muted-color'">{{ failureTitle(data) }}</span><small v-if="data.failureSummary?.level === 'LEGACY_PARTIAL'" class="block text-muted-color mt-1">หลักฐานจากระบบรุ่นเดิมมีรายละเอียดจำกัด</small></div></template></Column>
      <Column header="ช่วงข้อมูล"><template #body="{ data }">{{ data.dateFrom || '—' }}<span v-if="data.dateTo && data.dateTo !== data.dateFrom"> → {{ data.dateTo }}</span></template></Column>
      <Column field="rowCount" header="จำนวนแถว" header-class="table-number-column" body-class="table-number-column"><template #body="{ data }"><span class="metric-value">{{ data.rowCount.toLocaleString('th-TH') }}</span></template></Column>
      <Column field="queuedAt" header="เข้าคิวเมื่อ"><template #body="{ data }">{{ formatDateTime(data.queuedAt) }}</template></Column>
      <Column field="finishedAt" header="เสร็จเมื่อ"><template #body="{ data }">{{ formatDateTime(data.finishedAt) }}</template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button icon="pi pi-info-circle" text rounded class="touch-action" aria-label="ดูสาเหตุและหลักฐาน" v-tooltip.top="'ดูสาเหตุและหลักฐาน'" @click="openDetail(data)" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการสร้างรายงาน</div></template>
    </DataTable>
    <CursorPaginator :page="pagination.page" :page-size="pagination.pageSize" :item-count="rows.length" :has-next="pagination.hasNext" :disabled="loading" @previous="changePage('previous')" @next="changePage('next')" @update:page-size="changePageSize" />
  </div>
  <Dialog :visible="detailVisible" modal header="สาเหตุและหลักฐานการสร้างรายงาน" class="responsive-dialog failure-dialog" :style="{ width: '46rem' }" @update:visible="(value) => { if (!value) closeDetail(); }">
    <div v-if="detailLoading" class="grid gap-3"><Skeleton height="5rem" /><Skeleton height="10rem" /></div>
    <Message v-else-if="detailError" severity="error" :closable="false">{{ detailError }}</Message>
    <template v-else-if="detail">
      <Message v-if="detail.failureSummary" severity="error" :closable="false" class="mb-5">
        <div class="font-bold text-lg">{{ detail.failureSummary.presentation.titleTh }}</div>
        <div class="mt-1">{{ detail.failureSummary.presentation.summaryTh }}</div>
      </Message>
      <Message v-if="detail.connectionChangedSinceFailure" severity="warn" :closable="false" class="mb-5">การตั้งค่าการเชื่อมต่อ SML ถูกแก้ไขหลังเกิดเหตุ หลักฐานนี้อ้างอิงค่าที่ระบบใช้ในเวลานั้น</Message>

      <section class="failure-section">
        <h3>เกิดอะไรขึ้นและล้มที่ขั้นตอนไหน</h3>
        <dl class="failure-facts">
          <dt>รายงาน</dt><dd>{{ reportDefinitionByKey.get(detail.reportKey)?.label ?? detail.reportKey }}</dd>
          <dt>แหล่งงาน</dt><dd>{{ triggerKindLabel(detail.triggerKind) }}</dd>
          <dt>ขั้นตอนที่ล้ม</dt><dd>{{ detail.failureSummary?.presentation.stageTh || 'ระบบรุ่นเดิมไม่ได้บันทึกขั้นตอน' }}</dd>
          <dt>ระดับหลักฐาน</dt><dd>{{ evidenceLevelLabel(detail.failureSummary?.level) }}</dd>
          <dt>การรับส่งข้อมูล</dt><dd>{{ transportPhaseLabel(detail.failureSummary?.transportPhase) }}</dd>
        </dl>
      </section>

      <section class="failure-section">
        <h3>เวลาและระยะเวลา</h3>
        <dl class="failure-facts">
          <dt>เกิดเมื่อ</dt><dd>{{ formatDateTime(detail.failureSummary?.occurredAt || detail.finishedAt || detail.queuedAt) }} เวลาไทย</dd>
          <dt>ใช้เวลา</dt><dd>{{ formatDurationMs(detail.failureSummary?.durationMs) }}</dd>
          <dt>จำนวนครั้งที่ลอง</dt><dd>{{ (detail.failureSummary?.attempt ?? detail.progress?.attempt ?? 0).toLocaleString('th-TH') }}</dd>
        </dl>
      </section>

      <section class="failure-section">
        <h3>ผลกระทบต่อรายงานและ LINE</h3>
        <p>{{ reportImpactLabel(detail.impact) }}</p>
        <p class="font-semibold mb-0">{{ lineImpactLabel(detail.impact.notificationOutcome) }}</p>
      </section>

      <section v-if="detail.failureSummary" class="failure-section">
        <h3>หลักฐานจากระบบและสิ่งที่ควรตรวจสอบ</h3>
        <p v-if="detail.failureSummary.presentation.evidenceNoteTh" class="text-muted-color">{{ detail.failureSummary.presentation.evidenceNoteTh }}</p>
        <ul class="pl-5 mb-4"><li v-for="action in detail.failureSummary.presentation.nextActionsTh" :key="action" class="mb-2">{{ action }}</li></ul>
        <Button as="router-link" :to="`/admin/tenants/${detail.tenantId}?tab=sml`" label="เปิดการเชื่อมต่อ SML ของร้าน" icon="pi pi-external-link" outlined />
      </section>

      <Accordion>
        <AccordionPanel value="technical">
          <AccordionHeader>ข้อมูลสำหรับทีมเทคนิค</AccordionHeader>
          <AccordionContent>
            <dl class="failure-facts technical-detail">
              <dt>รหัสงาน</dt><dd>{{ detail.id }}</dd>
              <dt>รหัสข้อผิดพลาด</dt><dd>{{ detail.failureSummary?.safeErrorCode || detail.safeErrorCode || 'UNKNOWN' }}</dd>
              <dt>Stage</dt><dd>{{ detail.failureSummary?.stage || 'UNKNOWN' }}</dd>
              <dt>Transport phase</dt><dd>{{ detail.failureSummary?.transportPhase || 'UNKNOWN' }}</dd>
              <dt>Remote state</dt><dd>{{ detail.failureSummary?.remoteStateUnknown ? 'UNKNOWN' : 'CONFIRMED TERMINAL' }}</dd>
            </dl>
          </AccordionContent>
        </AccordionPanel>
      </Accordion>
    </template>
  </Dialog>
</template>

<style scoped>
.failure-section { padding-block: .25rem 1rem; border-bottom: 1px solid var(--surface-border); margin-bottom: 1rem; }
.failure-section h3 { font-size: 1rem; margin: 0 0 .75rem; color: var(--text-color); }
.failure-facts { display: grid; grid-template-columns: minmax(9rem, auto) 1fr; gap: .65rem 1.25rem; margin: 0; }
.failure-facts dt { color: var(--text-color-secondary); }
.failure-facts dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 640px) { .failure-facts { grid-template-columns: 1fr; gap: .2rem; } .failure-facts dd { margin-bottom: .65rem; } }
</style>
