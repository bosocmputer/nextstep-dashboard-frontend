<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ApiError, adminApi, type OperationalIncident, type OperationalIncidentSeverity, type OperationalIncidentStatus } from '@/api';
import CursorPaginator from '@/components/admin/CursorPaginator.vue';
import { acceptCursorPage, createCursorPagination, moveCursorPage, resetCursorPagination, resizeCursorPagination } from '@/utils/cursorPagination';
import { errorMessage, formatDateTime } from '@/utils/format';

const rows = ref<OperationalIncident[]>([]);
const loading = ref(false);
const error = ref('');
const status = ref<OperationalIncidentStatus>();
const severity = ref<OperationalIncidentSeverity>();
const scope = ref<'ACTIVE' | 'ALL'>('ACTIVE');
const pagination = reactive(createCursorPagination());
let generation = 0;
let controller: AbortController | undefined;

const statusOptions = [
  { label: 'ทุกสถานะ', value: undefined },
  { label: 'ยังไม่รับทราบ', value: 'OPEN' },
  { label: 'รับทราบแล้ว', value: 'ACKNOWLEDGED' },
  { label: 'ระบบยืนยันว่าหายแล้ว', value: 'RESOLVED' },
  { label: 'ยอมรับความเสี่ยง', value: 'CLOSED_ACCEPTED' }
];
const severityOptions = [
  { label: 'ทุกระดับ', value: undefined },
  { label: 'P1 · แจ้ง Telegram', value: 'P1' },
  { label: 'P2 · ติดตามในระบบ', value: 'P2' }
];
const scopeOptions = [{ label: 'ปัญหาที่ยังไม่หาย', value: 'ACTIVE' }, { label: 'รวมประวัติที่จบแล้ว', value: 'ALL' }];

function statusLabel(value: OperationalIncidentStatus) {
  return ({ OPEN: 'ยังไม่รับทราบ', ACKNOWLEDGED: 'รับทราบแล้ว', RESOLVED: 'ระบบยืนยันว่าหายแล้ว', CLOSED_ACCEPTED: 'ยอมรับความเสี่ยง' } as const)[value];
}
function statusSeverity(value: OperationalIncidentStatus) {
  return value === 'OPEN' ? 'danger' : value === 'ACKNOWLEDGED' ? 'warn' : value === 'RESOLVED' ? 'success' : 'secondary';
}
function subjectLabel(item: OperationalIncident) {
  return ({ TENANT: 'ร้านที่ได้รับผล', HOST_RESOURCE: 'ทรัพยากร Server ที่ต้องตรวจสอบ', BACKUP_POLICY: 'นโยบายสำรองข้อมูล', DATABASE: 'ฐานข้อมูลที่ได้รับผล', CONTAINER: 'บริการระบบที่ได้รับผล', LINE_PROVIDER: 'ผู้ให้บริการ LINE ที่ได้รับผล' } as const)[item.subjectType] ?? 'ส่วนที่ได้รับผล';
}
function impactLabel(item: OperationalIncident) { return `${subjectLabel(item)}: ${item.activeAffectedCount.toLocaleString('th-TH')}${item.subjectType === 'TENANT' ? ' ร้าน' : ' รายการ'}`; }
function checkArea(item: OperationalIncident) {
  if (item.rootCause === 'SML_CONNECTIVITY') return 'Server และ Java Web Service ของลูกค้า';
  if (item.rootCause === 'LINE_DELIVERY') return 'ผู้ให้บริการ LINE';
  if (item.subjectType === 'DATABASE') return 'ฐานข้อมูล Dashboard';
  return 'ระบบ Nextstep Dashboard';
}
function measurementLabel(item: OperationalIncident) {
  if (!item.measurement) return '';
  const suffix = item.measurement.unit === 'PERCENT' ? '%' : item.measurement.unit === 'SECONDS' ? ' วินาที' : '';
  return `ค่าที่พบ ${item.measurement.value.toLocaleString('th-TH', { maximumFractionDigits: 1 })}${suffix} · เริ่มเตือนที่ ${item.measurement.threshold.toLocaleString('th-TH', { maximumFractionDigits: 1 })}${suffix}`;
}
function tenantExamplesLabel(item: OperationalIncident) {
  const examples = (item.tenantExamples ?? []).slice(0, 2);
  if (examples.length === 0) return '';
  const remaining = Math.max(0, item.activeAffectedCount - examples.length);
  const unit = item.subjectType === 'TENANT' ? 'ร้าน' : 'รายการ';
  return remaining > 0
    ? `${examples.join(' · ')} และอีก ${remaining.toLocaleString('th-TH')} ${unit}`
    : examples.join(' · ');
}

async function load(reset = false) {
  if (reset) resetCursorPagination(pagination);
  generation++;
  controller?.abort(reset ? 'filters-changed' : 'page-changed');
  controller = new AbortController();
  const requestGeneration = generation;
  loading.value = true;
  error.value = '';
  try {
    const page = await adminApi.incidents({
      cursor: pagination.cursor,
      status: status.value,
      severity: severity.value,
      scope: scope.value,
      pageSize: pagination.pageSize
    }, controller.signal);
    if (requestGeneration !== generation) return;
    rows.value = page.data;
    acceptCursorPage(pagination, page.page.nextCursor ?? undefined, page.page.hasMore);
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause);
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
function changePage(direction: 'previous' | 'next') { if (moveCursorPage(pagination, direction)) void load(); }
function changePageSize(value: number) { resizeCursorPagination(pagination, value); void load(); }

onMounted(() => void load(true));
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="เหตุสำคัญ" subtitle="แสดงเฉพาะปัญหาที่ต้องติดตาม · การรับทราบไม่ถือว่าปัญหาหายแล้ว" />
  <Message severity="info" :closable="false" class="mb-4">
    P1 แจ้ง Telegram เมื่อเปิดโหมดส่ง ส่วน P2 เก็บไว้ตรวจสอบในหน้านี้ ระบบจะเปลี่ยนเป็น “หายแล้ว” เมื่อมีหลักฐานจากระบบเท่านั้น
  </Message>
  <div class="card table-card">
    <Toolbar class="mb-6 border-0 p-0">
      <template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template>
      <template #end>
        <form class="flex flex-col md:flex-row gap-3" @submit.prevent="load(true)">
          <Select v-model="severity" :options="severityOptions" option-label="label" option-value="value" aria-label="กรองระดับเหตุสำคัญ" />
          <Select v-model="scope" :options="scopeOptions" option-label="label" option-value="value" aria-label="กรองเหตุที่ยังไม่หายหรือประวัติทั้งหมด" />
          <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" aria-label="กรองสถานะเหตุสำคัญ" />
          <Button type="submit" label="กรอง" icon="pi pi-filter" />
        </form>
      </template>
    </Toolbar>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="severity" header="ระดับ"><template #body="{ data }"><Tag :severity="data.severity === 'P1' ? 'danger' : 'warn'" :value="data.severity" /></template></Column>
      <Column field="presentation.titleTh" header="เกิดอะไรขึ้น"><template #body="{ data }"><div class="max-w-96"><div class="font-semibold">{{ data.presentation.titleTh }}</div><small class="text-muted-color">อ้างอิง {{ data.alertRef }}</small></div></template></Column>
      <Column header="ส่วนที่ควรตรวจสอบ"><template #body="{ data }"><div class="max-w-72"><span>{{ checkArea(data) }}</span><small v-if="measurementLabel(data)" class="block text-muted-color">{{ measurementLabel(data) }}</small></div></template></Column>
      <Column field="activeAffectedCount" header="ผลกระทบที่ยังไม่หาย">
        <template #body="{ data }">
          <div>{{ impactLabel(data) }}</div>
          <small v-if="tenantExamplesLabel(data)" class="block max-w-80 truncate text-muted-color" :title="tenantExamplesLabel(data)">{{ tenantExamplesLabel(data) }}</small>
          <small class="text-muted-color">{{ data.observationMode === 'CONTINUOUS' ? 'ตรวจพบต่อเนื่อง' : `พบ ${data.occurrenceCount.toLocaleString('th-TH')} เหตุการณ์` }}</small>
        </template>
      </Column>
      <Column field="lastSeenAt" header="พบล่าสุด"><template #body="{ data }">{{ formatDateTime(data.lastSeenAt) }}</template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" /></template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button as="router-link" :to="`/admin/operational-incidents/${data.id}`" icon="pi pi-chevron-right" text rounded aria-label="เปิดรายละเอียดเหตุสำคัญ" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ไม่พบเหตุสำคัญตามตัวกรองนี้</div></template>
    </DataTable>
    <CursorPaginator :page="pagination.page" :page-size="pagination.pageSize" :item-count="rows.length" :has-next="pagination.hasNext" :disabled="loading" @previous="changePage('previous')" @next="changePage('next')" @update:page-size="changePageSize" />
  </div>
</template>
