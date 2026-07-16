<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, adminApi, type OperationalIncident, type OperationalIncidentSeverity, type OperationalIncidentStatus } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';

const rows = ref<OperationalIncident[]>([]);
const loading = ref(false);
const error = ref('');
const status = ref<OperationalIncidentStatus>();
const severity = ref<OperationalIncidentSeverity>();
const cursor = ref<string>();
const hasMore = ref(false);
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

function statusLabel(value: OperationalIncidentStatus) {
  return ({ OPEN: 'ยังไม่รับทราบ', ACKNOWLEDGED: 'รับทราบแล้ว', RESOLVED: 'ระบบยืนยันว่าหายแล้ว', CLOSED_ACCEPTED: 'ยอมรับความเสี่ยง' } as const)[value];
}
function statusSeverity(value: OperationalIncidentStatus) {
  return value === 'OPEN' ? 'danger' : value === 'ACKNOWLEDGED' ? 'warn' : value === 'RESOLVED' ? 'success' : 'secondary';
}
function rootCauseLabel(value: OperationalIncident['rootCause']) {
  return ({ SML_CONNECTIVITY: 'การเชื่อมต่อ SML', REPORT_DATA: 'ข้อมูลรายงาน', LINE_DELIVERY: 'การส่ง LINE', PLATFORM: 'ระบบ Nextstep', CAPACITY: 'ทรัพยากรระบบ' } as const)[value];
}

async function load(reset = true) {
  if (!reset && loading.value) return;
  if (reset) {
    generation++;
    controller?.abort('filters-changed');
    controller = new AbortController();
  }
  const requestGeneration = generation;
  loading.value = true;
  error.value = '';
  try {
    const page = await adminApi.incidents({
      cursor: reset ? undefined : cursor.value,
      status: status.value,
      severity: severity.value
    }, controller?.signal);
    if (requestGeneration !== generation) return;
    rows.value = reset ? page.data : [...rows.value, ...page.data];
    cursor.value = page.page.nextCursor ?? undefined;
    hasMore.value = page.page.hasMore;
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause);
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

onMounted(() => void load());
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
        <form class="flex flex-col md:flex-row gap-3" @submit.prevent="load()">
          <Select v-model="severity" :options="severityOptions" option-label="label" option-value="value" aria-label="กรองระดับเหตุสำคัญ" />
          <Select v-model="status" :options="statusOptions" option-label="label" option-value="value" aria-label="กรองสถานะเหตุสำคัญ" />
          <Button type="submit" label="กรอง" icon="pi pi-filter" />
        </form>
      </template>
    </Toolbar>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="severity" header="ระดับ"><template #body="{ data }"><Tag :severity="data.severity === 'P1' ? 'danger' : 'warn'" :value="data.severity" /></template></Column>
      <Column field="alertRef" header="รหัสอ้างอิง"><template #body="{ data }"><code>{{ data.alertRef }}</code></template></Column>
      <Column field="rootCause" header="สาเหตุหลัก"><template #body="{ data }"><span class="font-semibold">{{ rootCauseLabel(data.rootCause) }}</span></template></Column>
      <Column field="safeErrorCode" header="รหัสปลอดภัย"><template #body="{ data }"><code>{{ data.safeErrorCode || 'UNKNOWN' }}</code></template></Column>
      <Column field="affectedCount" header="ได้รับผล" header-class="table-number-column" body-class="table-number-column"><template #body="{ data }">{{ data.affectedCount.toLocaleString('th-TH') }}</template></Column>
      <Column field="lastSeenAt" header="พบล่าสุด"><template #body="{ data }">{{ formatDateTime(data.lastSeenAt) }}</template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" /></template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button as="router-link" :to="`/admin/operational-incidents/${data.id}`" icon="pi pi-chevron-right" text rounded aria-label="เปิดรายละเอียดเหตุสำคัญ" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ไม่พบเหตุสำคัญตามตัวกรองนี้</div></template>
    </DataTable>
    <div v-if="hasMore" class="table-footer text-center"><Button label="โหลดเพิ่มเติม" outlined :loading="loading" @click="load(false)" /></div>
  </div>
</template>
