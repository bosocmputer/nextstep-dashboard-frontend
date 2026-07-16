<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { ApiError, adminApi, type OperationalIncidentDetail, type OperationalIncidentStatus } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const incident = ref<OperationalIncidentDetail>();
const loading = ref(false);
const mutating = ref(false);
const error = ref('');
const acceptDialog = ref(false);
const acceptReason = ref('');
let controller: AbortController | undefined;

const incidentId = computed(() => String(route.params.incidentId || ''));
const canAcknowledge = computed(() => incident.value?.status === 'OPEN');
const canAcceptRisk = computed(() => incident.value?.status === 'OPEN' || incident.value?.status === 'ACKNOWLEDGED');
const unsafeReason = computed(() => /(https?:\/\/|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b[0-9]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9]{5,16}:[A-Za-z0-9_-]{24,}\b|(?:deliveryRef|[?&]ref)=)/i.test(acceptReason.value));
const validReason = computed(() => [...acceptReason.value.trim()].length >= 12 && [...acceptReason.value.trim()].length <= 500 && !unsafeReason.value);

function statusLabel(value: OperationalIncidentStatus) {
  return ({ OPEN: 'ยังไม่รับทราบ', ACKNOWLEDGED: 'รับทราบแล้ว', RESOLVED: 'ระบบยืนยันว่าหายแล้ว', CLOSED_ACCEPTED: 'ยอมรับความเสี่ยง' } as const)[value];
}
function statusSeverity(value: OperationalIncidentStatus) {
  return value === 'OPEN' ? 'danger' : value === 'ACKNOWLEDGED' ? 'warn' : value === 'RESOLVED' ? 'success' : 'secondary';
}
function eventLabel(value: string) {
  return ({ OBSERVED: 'ตรวจพบ', ACKNOWLEDGED: 'Admin รับทราบ', EVIDENCE_RESOLVED: 'ระบบยืนยันการฟื้นตัว', RISK_ACCEPTED: 'ยอมรับความเสี่ยง', ALERT_SENT: 'ส่ง Telegram แล้ว', ALERT_FAILED: 'ส่ง Telegram ไม่สำเร็จ' } as Record<string, string>)[value] ?? value;
}

async function load() {
  controller?.abort('superseded');
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    incident.value = await adminApi.incident(incidentId.value, controller.signal);
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function acknowledge() {
  if (!incident.value || !canAcknowledge.value || mutating.value) return;
  mutating.value = true;
  try {
    await adminApi.acknowledgeIncident(incident.value);
    await load();
    toast.add({ severity: 'success', summary: 'รับทราบเหตุสำคัญแล้ว', detail: 'ระบบหยุดข้อความเตือนซ้ำ แต่ยังติดตามหลักฐานการฟื้นตัวต่อ', life: 5000 });
  } catch (cause) { error.value = errorMessage(cause); }
  finally { mutating.value = false; }
}

async function acceptRisk() {
  if (!incident.value || !canAcceptRisk.value || !validReason.value || mutating.value) return;
  mutating.value = true;
  try {
    await adminApi.acceptIncidentRisk(incident.value, acceptReason.value.trim());
    acceptDialog.value = false;
    acceptReason.value = '';
    await load();
    toast.add({ severity: 'warn', summary: 'ปิดโดยยอมรับความเสี่ยงแล้ว', detail: 'รายการนี้ไม่ได้ถูกระบุว่าระบบหายแล้ว', life: 5000 });
  } catch (cause) { error.value = errorMessage(cause); }
  finally { mutating.value = false; }
}

async function copyForCodex() {
  if (!incident.value) return;
  const value = [
    'Nextstep Sentinel incident',
    `alert_ref: ${incident.value.alertRef}`,
    `severity: ${incident.value.severity}`,
    `status: ${incident.value.status}`,
    `incident_type: ${incident.value.incidentType}`,
    `root_cause: ${incident.value.rootCause}`,
    `safe_error_code: ${incident.value.safeErrorCode || 'UNKNOWN'}`,
    `first_seen_at: ${incident.value.firstSeenAt}`,
    `last_seen_at: ${incident.value.lastSeenAt}`
  ].join('\n');
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ severity: 'success', summary: 'คัดลอกข้อมูลปลอดภัยแล้ว', detail: 'ข้อความไม่มี KPI, SQL, token หรือข้อมูลลูกค้า', life: 4000 });
  } catch {
    toast.add({ severity: 'error', summary: 'คัดลอกไม่สำเร็จ', detail: 'กรุณาอนุญาตการใช้ Clipboard แล้วลองใหม่', life: 4000 });
  }
}

onMounted(() => void load());
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="รายละเอียดเหตุสำคัญ" :subtitle="incident ? incident.alertRef : 'กำลังโหลดข้อมูล'" mobile-mode="entity">
    <template #back><Button icon="pi pi-arrow-left" text rounded aria-label="กลับไปเหตุสำคัญ" @click="router.push('/admin/operational-incidents')" /></template>
    <template #actions>
      <Button label="คัดลอกสำหรับ Codex" icon="pi pi-copy" outlined :disabled="!incident" @click="copyForCodex" />
      <Button v-if="canAcknowledge" label="รับทราบ" icon="pi pi-check" :loading="mutating" @click="acknowledge" />
      <Button v-if="canAcceptRisk" label="ยอมรับความเสี่ยง" icon="pi pi-times-circle" severity="danger" outlined :disabled="mutating" @click="acceptDialog = true" />
    </template>
  </AppPageHeader>
  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <div v-if="loading && !incident" class="card"><Skeleton height="12rem" /></div>
  <template v-else-if="incident">
    <Message v-if="incident.status === 'CLOSED_ACCEPTED'" severity="warn" :closable="false" class="mb-4">ปิดโดย Admin ยอมรับความเสี่ยง ไม่ได้หมายความว่าระบบฟื้นตัวแล้ว</Message>
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
      <section class="card lg:col-span-2 m-0">
        <div class="flex flex-wrap items-center gap-3 mb-5"><Tag :severity="incident.severity === 'P1' ? 'danger' : 'warn'" :value="incident.severity" /><Tag :severity="statusSeverity(incident.status)" :value="statusLabel(incident.status)" /><code>{{ incident.safeErrorCode || 'UNKNOWN' }}</code></div>
        <dl class="incident-summary m-0">
          <dt>ประเภท</dt><dd>{{ incident.incidentType }}</dd>
          <dt>สาเหตุหลัก</dt><dd>{{ incident.rootCause }}</dd>
          <dt>พบครั้งแรก</dt><dd>{{ formatDateTime(incident.firstSeenAt) }}</dd>
          <dt>พบล่าสุด</dt><dd>{{ formatDateTime(incident.lastSeenAt) }}</dd>
          <dt>จำนวนเหตุการณ์</dt><dd>{{ incident.occurrenceCount.toLocaleString('th-TH') }}</dd>
          <dt>ทรัพยากรที่ได้รับผล</dt><dd>{{ incident.affectedCount.toLocaleString('th-TH') }}</dd>
          <template v-if="incident.acceptedReason"><dt>เหตุผลที่ยอมรับความเสี่ยง</dt><dd>{{ incident.acceptedReason }}</dd></template>
        </dl>
      </section>
      <aside class="card m-0">
        <h2 class="text-base mt-0">หลักการสถานะ</h2>
        <p class="text-muted-color mb-0">Admin รับทราบได้เพื่อหยุดการเตือนซ้ำ แต่มีเพียงหลักฐานจากระบบเท่านั้นที่เปลี่ยนเหตุเป็น “หายแล้ว”</p>
      </aside>
    </div>
    <section class="card table-card">
      <h2 class="text-lg mt-0">ลำดับเหตุการณ์</h2>
      <DataTable :value="incident.events" data-key="id" striped-rows scrollable>
        <Column field="observedAt" header="เวลา"><template #body="{ data }">{{ formatDateTime(data.observedAt) }}</template></Column>
        <Column field="eventKind" header="เหตุการณ์"><template #body="{ data }">{{ eventLabel(data.eventKind) }}</template></Column>
        <Column field="sourceKind" header="แหล่งตรวจพบ" />
        <Column field="tenantName" header="ร้าน/ขอบเขต"><template #body="{ data }">{{ data.tenantName || 'ระบบส่วนกลาง' }}</template></Column>
        <Column field="safeErrorCode" header="รหัสปลอดภัย"><template #body="{ data }"><code>{{ data.safeErrorCode || '—' }}</code></template></Column>
      </DataTable>
    </section>
  </template>
  <Dialog v-model:visible="acceptDialog" modal header="ยอมรับความเสี่ยง" class="responsive-dialog" :style="{ width: '34rem' }">
    <Message severity="warn" :closable="false" class="mb-4">การทำรายการนี้จะปิด Incident โดยไม่อ้างว่าระบบฟื้นตัว กรุณาระบุเหตุผลที่ตรวจสอบย้อนหลังได้</Message>
    <label for="accept-risk-reason" class="block font-semibold mb-2">เหตุผล (12–500 ตัวอักษร)</label>
    <small class="block text-muted-color mb-2">ระบุเฉพาะเหตุผลเชิงปฏิบัติการ ห้ามใส่ชื่อร้าน รหัสลูกค้า URL เบอร์โทร token KPI หรือข้อมูลดิบ</small>
    <Textarea id="accept-risk-reason" v-model="acceptReason" rows="5" class="w-full" maxlength="500" />
    <small v-if="unsafeReason" class="block text-red-500 mt-2">ลบข้อมูลอ้างอิงหรือข้อมูลลูกค้าออกก่อนยืนยัน</small>
    <template #footer><Button label="ยกเลิก" text @click="acceptDialog = false" /><Button label="ยืนยันการยอมรับความเสี่ยง" severity="danger" :disabled="!validReason" :loading="mutating" @click="acceptRisk" /></template>
  </Dialog>
</template>

<style scoped>
.incident-summary { display: grid; grid-template-columns: minmax(9rem, auto) 1fr; gap: .75rem 1.5rem; }
.incident-summary dt { color: var(--text-color-secondary); }
.incident-summary dd { margin: 0; overflow-wrap: anywhere; }
@media (max-width: 640px) { .incident-summary { grid-template-columns: 1fr; gap: .25rem; } .incident-summary dd { margin-bottom: .75rem; } }
</style>
