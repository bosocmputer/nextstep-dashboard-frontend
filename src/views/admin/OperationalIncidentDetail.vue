<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { ApiError, adminApi, type AdminReportDefinition, type OperationalIncidentDetail, type OperationalIncidentEvent, type OperationalIncidentOccurrence, type OperationalIncidentStatus, type SMLConnectionTestResult } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';
import { loadAdminReportCatalog } from '@/stores/reportCatalog';
import {
  buildCodexIncidentText, causalChain, evidenceLevelLabel, eventKindLabel, formatDurationMs,
  lineImpactLabel, reportImpactLabel, sourceKindLabel, triggerKindLabel
} from '@/utils/operationalPresentation';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const confirm = useConfirm();
const incident = ref<OperationalIncidentDetail>();
const loading = ref(false);
const mutating = ref(false);
const error = ref('');
const acceptDialog = ref(false);
const acceptReason = ref('');
const reportDefinitions = ref<AdminReportDefinition[]>([]);
const occurrences = ref<OperationalIncidentOccurrence[]>([]);
const occurrenceCursor = ref<string>();
const occurrenceHasMore = ref(false);
const occurrenceLoading = ref(false);
const testingTenantId = ref('');
const testResults = ref<Record<string, SMLConnectionTestResult>>({});
let controller: AbortController | undefined;
let occurrenceController: AbortController | undefined;
let occurrenceGeneration = 0;

const incidentId = computed(() => String(route.params.incidentId || ''));
const canAcknowledge = computed(() => incident.value?.status === 'OPEN');
const canAcceptRisk = computed(() => incident.value?.status === 'OPEN' || incident.value?.status === 'ACKNOWLEDGED');
const unsafeReason = computed(() => /(https?:\/\/|\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b|\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b[0-9]{8,}\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b|\b[0-9]{5,16}:[A-Za-z0-9_-]{24,}\b|(?:deliveryRef|[?&]ref)=)/i.test(acceptReason.value));
const validReason = computed(() => [...acceptReason.value.trim()].length >= 12 && [...acceptReason.value.trim()].length <= 500 && !unsafeReason.value);
const reportDefinitionByKey = computed(() => new Map(reportDefinitions.value.map((item) => [item.reportKey, item])));
const primaryEvent = computed(() => incident.value?.events.find((event) => event.failureEvidence && !event.isDownstream) ?? incident.value?.events.find((event) => event.failureEvidence));
const chain = computed(() => causalChain(primaryEvent.value));
const affectedLabel = computed(() => incident.value?.causeBreakdown?.[0]?.affectedLabelTh ?? 'ส่วนที่ได้รับผล');

function statusLabel(value: OperationalIncidentStatus) {
  return ({ OPEN: 'ยังไม่รับทราบ', ACKNOWLEDGED: 'รับทราบแล้ว', RESOLVED: 'ระบบยืนยันว่าหายแล้ว', CLOSED_ACCEPTED: 'ยอมรับความเสี่ยง' } as const)[value];
}
function statusSeverity(value: OperationalIncidentStatus) {
  return value === 'OPEN' ? 'danger' : value === 'ACKNOWLEDGED' ? 'warn' : value === 'RESOLVED' ? 'success' : 'secondary';
}
function reportLabel(event: OperationalIncidentEvent) {
  if (!event.reportKey) return 'ไม่ระบุรายงาน';
  return reportDefinitionByKey.value.get(event.reportKey)?.label ?? 'รายงานที่เกี่ยวข้อง';
}
function eventTitle(event: OperationalIncidentEvent) {
  return event.failureEvidence?.presentation.titleTh ?? eventKindLabel(event.eventKind);
}

async function load() {
  controller?.abort('superseded');
  occurrenceController?.abort('incident-reloaded');
  controller = new AbortController();
  loading.value = true;
  error.value = '';
  try {
    incident.value = await adminApi.incident(incidentId.value, controller.signal);
    void loadOccurrences(true);
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}

async function loadOccurrences(reset = false) {
  if (!reset && (occurrenceLoading.value || !occurrenceHasMore.value)) return;
  if (reset) {
    occurrenceGeneration++;
    occurrenceController?.abort('occurrences-reloaded');
    occurrenceController = new AbortController();
  }
  const requestGeneration = occurrenceGeneration;
  occurrenceLoading.value = true;
  try {
    const page = await adminApi.incidentOccurrences(incidentId.value, reset ? undefined : occurrenceCursor.value, occurrenceController?.signal);
    if (requestGeneration !== occurrenceGeneration) return;
    occurrences.value = reset ? page.data : [...occurrences.value, ...page.data];
    occurrenceCursor.value = page.page.nextCursor ?? undefined;
    occurrenceHasMore.value = page.page.hasMore;
  } catch (cause) {
    if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause);
  } finally {
    if (requestGeneration === occurrenceGeneration) occurrenceLoading.value = false;
  }
}

function displayEndpoint(item: OperationalIncidentOccurrence) {
  return item.smlConnectionReference?.currentEndpointUrl || item.smlConnectionReference?.endpointUrlAtFailure || '';
}
function currentTestEndpoint(item: OperationalIncidentOccurrence) { return item.smlConnectionReference?.currentEndpointUrl || ''; }
function testResult(item: OperationalIncidentOccurrence) { return item.tenantId ? testResults.value[item.tenantId] : undefined; }

function confirmConnectionTest(item: OperationalIncidentOccurrence) {
  const endpoint = currentTestEndpoint(item);
  if (!item.tenantId || !endpoint || testingTenantId.value) return;
  confirm.require({
    header: 'ทดสอบจาก Server Dashboard',
    message: `ระบบจะติดต่อ Java Web Service ของ ${item.tenantName || 'ร้านนี้'} ที่ URL ปัจจุบันด้วยคำสั่ง read-only ขนาดเล็ก โดยไม่ดึงรายงานหรือ KPI\n\n${endpoint}`,
    icon: 'pi pi-exclamation-triangle',
    rejectLabel: 'ยกเลิก', acceptLabel: 'เริ่มทดสอบ',
    accept: () => void testConnection(item)
  });
}

async function testConnection(item: OperationalIncidentOccurrence) {
  if (!item.tenantId || testingTenantId.value) return;
  testingTenantId.value = item.tenantId;
  try {
    const result = await adminApi.testSML(item.tenantId);
    testResults.value = { ...testResults.value, [item.tenantId]: result };
    toast.add({ severity: 'success', summary: 'ทดสอบสำเร็จ', detail: `Server Dashboard ติดต่อ Java Web Service ได้ · ใช้เวลา ${result.latencyMs.toLocaleString('th-TH')} มิลลิวินาที`, life: 6000 });
  } catch (cause) {
    const wait = cause instanceof ApiError && cause.retryAfterMs ? ` ลองใหม่ได้อีกประมาณ ${Math.ceil(cause.retryAfterMs / 1000)} วินาที` : '';
    toast.add({ severity: 'warn', summary: 'ยังทดสอบไม่ได้', detail: `${errorMessage(cause)}${wait}`, life: 7000 });
  } finally { testingTenantId.value = ''; }
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
  const value = buildCodexIncidentText(incident.value);
  try {
    await navigator.clipboard.writeText(value);
    toast.add({ severity: 'success', summary: 'คัดลอกข้อมูลปลอดภัยแล้ว', detail: 'ข้อความไม่มี KPI, SQL, token หรือข้อมูลลูกค้า', life: 4000 });
  } catch {
    toast.add({ severity: 'error', summary: 'คัดลอกไม่สำเร็จ', detail: 'กรุณาอนุญาตการใช้ Clipboard แล้วลองใหม่', life: 4000 });
  }
}

onMounted(() => {
  void loadAdminReportCatalog().then((catalog) => { reportDefinitions.value = catalog.data; }).catch(() => undefined);
  void load();
});
onBeforeUnmount(() => {
  controller?.abort('unmounted');
  occurrenceController?.abort('unmounted');
});
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
        <div class="flex flex-wrap items-center gap-3 mb-4"><Tag :severity="incident.severity === 'P1' ? 'danger' : 'warn'" :value="incident.severity" /><Tag :severity="statusSeverity(incident.status)" :value="statusLabel(incident.status)" /></div>
        <h2 class="incident-title">{{ incident.presentation.titleTh }}</h2>
        <p class="text-muted-color mt-0 mb-5">{{ incident.presentation.summaryTh }}</p>
        <dl class="incident-summary m-0">
          <dt>พบครั้งแรก</dt><dd>{{ formatDateTime(incident.firstSeenAt) }} เวลาไทย</dd>
          <dt>พบล่าสุด</dt><dd>{{ formatDateTime(incident.lastSeenAt) }} เวลาไทย</dd>
          <dt>ลักษณะการตรวจพบ</dt><dd>{{ incident.observationMode === 'CONTINUOUS' ? 'ตรวจพบต่อเนื่อง' : `พบ ${incident.occurrenceCount.toLocaleString('th-TH')} เหตุการณ์` }}</dd>
          <dt>{{ affectedLabel }}ที่ยังไม่หาย</dt><dd>{{ incident.activeAffectedCount.toLocaleString('th-TH') }} รายการ</dd>
          <template v-if="incident.measurement"><dt>ค่าที่ตรวจพบล่าสุด</dt><dd>{{ incident.measurement.value.toLocaleString('th-TH', { maximumFractionDigits: 1 }) }}{{ incident.measurement.unit === 'PERCENT' ? '%' : incident.measurement.unit === 'SECONDS' ? ' วินาที' : '' }} · เริ่มเตือนที่ {{ incident.measurement.threshold.toLocaleString('th-TH', { maximumFractionDigits: 1 }) }}{{ incident.measurement.unit === 'PERCENT' ? '%' : incident.measurement.unit === 'SECONDS' ? ' วินาที' : '' }}</dd></template>
          <template v-if="incident.acceptedReason"><dt>เหตุผลที่ยอมรับความเสี่ยง</dt><dd>{{ incident.acceptedReason }}</dd></template>
        </dl>
      </section>
      <aside class="card m-0">
        <h2 class="text-base mt-0">หลักการสถานะ</h2>
        <p class="text-muted-color mb-0">Admin รับทราบได้เพื่อหยุดการเตือนซ้ำ แต่มีเพียงหลักฐานจากระบบเท่านั้นที่เปลี่ยนเหตุเป็น “หายแล้ว”</p>
      </aside>
    </div>

    <section v-if="incident.causeBreakdown?.length" class="card">
      <h2 class="text-lg mt-0 mb-1">สาเหตุและส่วนที่ควรตรวจสอบ</h2>
      <p class="text-muted-color mt-0 mb-4">แยกตามหลักฐานที่ระบบบันทึก ไม่สรุปว่า Server ปิดหรือ Firewall บล็อกหากยังพิสูจน์ไม่ได้</p>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div v-for="cause in incident.causeBreakdown" :key="`${cause.category}-${cause.stage}-${cause.transportPhase}`" class="cause-card">
          <strong>{{ cause.presentation.titleTh }}</strong>
          <span>{{ cause.presentation.stageTh }}</span>
          <small>{{ cause.affectedLabelTh }}ที่ยังไม่หาย {{ cause.activeAffectedCount.toLocaleString('th-TH') }} รายการ · {{ cause.investigationScope === 'CUSTOMER_SYSTEM' ? 'ควรตรวจ Server ลูกค้า' : cause.investigationScope === 'LINE_PROVIDER' ? 'ควรตรวจผู้ให้บริการ LINE' : cause.investigationScope === 'CONFIGURATION' ? 'ควรตรวจการตั้งค่า SML' : 'ควรตรวจระบบ Nextstep Dashboard' }}</small>
        </div>
      </div>
    </section>

    <section v-if="chain.length" class="card causal-card">
      <h2 class="text-lg mt-0 mb-4">ลำดับสาเหตุและผลกระทบ</h2>
      <ol class="causal-chain m-0 p-0">
        <li v-for="(item, index) in chain" :key="`${index}-${item}`">
          <span class="causal-index" aria-hidden="true">{{ index + 1 }}</span>
          <span>{{ item }}</span>
        </li>
      </ol>
    </section>

    <section class="card table-card">
      <h2 class="text-lg mt-0 mb-1">หลักฐานตามลำดับเวลา</h2>
      <p class="text-muted-color mt-0 mb-4">แสดงข้อเท็จจริงที่ระบบบันทึกในเวลาที่เกิดเหตุ โดยไม่คาดเดาว่า Server ปิดหรือ Network ถูกบล็อก</p>
      <DataTable :value="incident.events" data-key="id" striped-rows scrollable>
        <Column field="observedAt" header="เวลา"><template #body="{ data }"><span class="whitespace-nowrap">{{ formatDateTime(data.observedAt) }}</span></template></Column>
        <Column field="eventKind" header="เกิดอะไรขึ้น"><template #body="{ data }"><div class="event-description"><span class="font-semibold">{{ eventTitle(data) }}</span><small>{{ eventKindLabel(data.eventKind) }} · {{ evidenceLevelLabel(data.failureEvidence?.level) }}</small></div></template></Column>
        <Column field="tenantName" header="ร้าน/รายงาน"><template #body="{ data }"><div class="event-description"><span>{{ data.tenantName || 'ระบบส่วนกลาง' }}</span><small>{{ reportLabel(data) }}</small></div></template></Column>
        <Column field="sourceKind" header="แหล่งงาน"><template #body="{ data }"><div class="event-description"><span>{{ sourceKindLabel(data.sourceKind) }}</span><small>{{ triggerKindLabel(data.triggerKind) }}</small></div></template></Column>
        <Column header="ขั้นตอนและระยะเวลา"><template #body="{ data }"><div class="event-description"><span>{{ data.failureEvidence?.presentation.stageTh || 'ไม่มีรายละเอียดขั้นตอนเพิ่มเติม' }}</span><small>{{ formatDurationMs(data.failureEvidence?.durationMs) }}</small></div></template></Column>
        <Column header="ผลกระทบ"><template #body="{ data }"><div class="event-description"><span>{{ reportImpactLabel(data.impact) }}</span><small>{{ lineImpactLabel(data.impact?.notificationOutcome) }}</small></div></template></Column>
      </DataTable>
    </section>

    <section class="card table-card">
      <h2 class="text-lg mt-0 mb-1">เหตุที่ได้รับผลและการตรวจ Java Web Service</h2>
      <p class="text-muted-color mt-0 mb-4">การเปิด URL จาก Browser ยืนยันได้เฉพาะเครื่องของคุณ ส่วนการทดสอบจาก Server Dashboard จะติดต่อ Java Web Service จริงด้วยคำสั่ง read-only ขนาดเล็ก และไม่ทำให้ Incident เปลี่ยนเป็น “หายแล้ว”</p>
      <DataTable :value="occurrences" :loading="occurrenceLoading" data-key="id" striped-rows scrollable>
        <Column field="tenantName" header="ร้าน/รายงาน"><template #body="{ data }"><div class="event-description"><span>{{ data.tenantName || 'ระบบส่วนกลาง' }}</span><small>{{ data.reportKey ? (reportDefinitionByKey.get(data.reportKey)?.label ?? 'รายงานที่เกี่ยวข้อง') : sourceKindLabel(data.sourceKind) }}</small></div></template></Column>
        <Column field="observedAt" header="เวลา"><template #body="{ data }"><span class="whitespace-nowrap">{{ formatDateTime(data.observedAt) }}</span></template></Column>
        <Column header="URL Java Web Service">
          <template #body="{ data }">
            <div v-if="data.smlConnectionReference && displayEndpoint(data)" class="endpoint-cell">
              <small>{{ data.smlConnectionReference.endpointUrlAtFailure ? 'URL ที่ใช้ตอนเกิดเหตุ' : 'URL ปัจจุบัน' }}</small>
              <a :href="data.smlConnectionReference.endpointUrlAtFailure || displayEndpoint(data)" target="_blank" rel="noopener noreferrer" class="endpoint-link">{{ data.smlConnectionReference.endpointUrlAtFailure || displayEndpoint(data) }}</a>
              <template v-if="data.smlConnectionReference.status === 'CHANGED_SINCE_FAILURE'">
                <small class="text-orange-600">การตั้งค่าเปลี่ยนหลังเกิดเหตุ · URL ปัจจุบัน</small>
                <a :href="data.smlConnectionReference.currentEndpointUrl" target="_blank" rel="noopener noreferrer" class="endpoint-link">{{ data.smlConnectionReference.currentEndpointUrl }}</a>
              </template>
              <small v-else-if="data.smlConnectionReference.status === 'CURRENT_ONLY'" class="text-orange-600">ไม่มี URL รุ่นเดิม จึงแสดง URL ปัจจุบันโดยไม่อ้างว่าเป็นค่าตอนเกิดเหตุ</small>
              <small v-if="data.smlConnectionReference.schemeSecurity === 'HTTP'" class="text-orange-600">การเชื่อมต่อนี้ไม่ได้เข้ารหัส</small>
              <small>เปิดใน Browser ไม่ได้ยืนยันว่า Server Dashboard เชื่อมต่อได้</small>
              <a :href="data.smlConnectionReference.endpointUrlAtFailure || displayEndpoint(data)" target="_blank" rel="noopener noreferrer" class="endpoint-open-action"><i class="pi pi-external-link" aria-hidden="true" /> เปิด URL ใน Browser</a>
            </div>
            <span v-else class="text-muted-color">ไม่มี URL ที่ยืนยันได้จากหลักฐาน</span>
          </template>
        </Column>
        <Column header="ตรวจจาก Server" header-class="table-action-column" body-class="table-action-column">
          <template #body="{ data }">
            <div class="grid justify-items-end gap-1">
              <Button label="ทดสอบจาก Server Dashboard" icon="pi pi-bolt" outlined size="small" :loading="testingTenantId === data.tenantId" :disabled="!data.tenantId || !currentTestEndpoint(data) || Boolean(testingTenantId)" @click="confirmConnectionTest(data)" />
              <small v-if="testResult(data)" class="text-green-600">สำเร็จเมื่อ {{ formatDateTime(testResult(data)!.testedAt) }} · {{ testResult(data)!.latencyMs.toLocaleString('th-TH') }} ms</small>
              <small v-else-if="data.smlConnectionReference?.testAvailableAt" class="text-muted-color">ทดสอบได้อีกครั้งหลัง {{ formatDateTime(data.smlConnectionReference.testAvailableAt) }}</small>
            </div>
          </template>
        </Column>
        <template #empty><div class="py-6 text-center text-muted-color">ไม่มีเหตุรายรายการที่แสดงได้</div></template>
      </DataTable>
      <div v-if="occurrenceHasMore" class="table-footer text-center"><Button label="โหลดเหตุเพิ่มเติม" outlined :loading="occurrenceLoading" @click="loadOccurrences(false)" /></div>
    </section>

    <section v-if="primaryEvent?.failureEvidence" class="card">
      <h2 class="text-lg mt-0">สิ่งที่ควรตรวจสอบต่อ</h2>
      <p v-if="primaryEvent.failureEvidence.presentation.evidenceNoteTh" class="text-muted-color">{{ primaryEvent.failureEvidence.presentation.evidenceNoteTh }}</p>
      <ul class="pl-5 mb-0"><li v-for="action in primaryEvent.failureEvidence.presentation.nextActionsTh" :key="action" class="mb-2">{{ action }}</li></ul>
      <Message v-if="incident.subjectType === 'TENANT'" severity="info" :closable="false" class="mt-4 mb-0">ระบบจะยืนยันการฟื้นตัวจากรอบส่งตามตารางที่สำเร็จหลังเหตุนี้ หากตารางถูกพักหรือลบ จะไม่มีรอบถัดไปสำหรับยืนยันอัตโนมัติ</Message>
      <Message v-if="primaryEvent.connectionChangedSinceFailure" severity="warn" :closable="false" class="mt-4 mb-0">การตั้งค่าการเชื่อมต่อ SML ถูกแก้ไขหลังเกิดเหตุ หลักฐานนี้อ้างอิงค่าที่ระบบใช้ในเวลานั้น</Message>
    </section>

    <Accordion class="mb-4">
      <AccordionPanel value="technical">
        <AccordionHeader>ข้อมูลสำหรับทีมเทคนิค</AccordionHeader>
        <AccordionContent>
          <dl class="incident-summary technical-detail m-0">
            <dt>Alert reference</dt><dd>{{ incident.alertRef }}</dd>
            <dt>Incident type</dt><dd>{{ incident.incidentType }}</dd>
            <dt>Root cause</dt><dd>{{ incident.rootCause }}</dd>
            <dt>Safe error code</dt><dd>{{ incident.safeErrorCode || 'UNKNOWN' }}</dd>
            <template v-if="primaryEvent?.failureEvidence"><dt>Stage</dt><dd>{{ primaryEvent.failureEvidence.stage }}</dd><dt>Transport phase</dt><dd>{{ primaryEvent.failureEvidence.transportPhase || 'UNKNOWN' }}</dd><dt>Remote state</dt><dd>{{ primaryEvent.failureEvidence.remoteStateUnknown ? 'UNKNOWN' : 'CONFIRMED TERMINAL' }}</dd></template>
          </dl>
        </AccordionContent>
      </AccordionPanel>
    </Accordion>
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
.incident-title { font-size: clamp(1.25rem, 2vw, 1.65rem); line-height: 1.35; margin: 0 0 .35rem; }
.causal-card { border-inline-start: .25rem solid var(--p-primary-color); }
.causal-chain { list-style: none; display: grid; gap: .75rem; }
.causal-chain li { display: grid; grid-template-columns: 2rem minmax(0, 1fr); align-items: center; gap: .75rem; position: relative; }
.causal-chain li:not(:last-child)::after { content: ''; position: absolute; inset-block-start: 2rem; inset-inline-start: .95rem; height: .75rem; border-inline-start: 2px solid var(--surface-border); }
.causal-index { width: 2rem; height: 2rem; border-radius: 999px; display: inline-grid; place-items: center; color: var(--p-primary-color); background: color-mix(in srgb, var(--p-primary-color) 12%, transparent); font-weight: 700; }
.event-description { min-width: 11rem; display: grid; gap: .25rem; }
.event-description small { color: var(--text-color-secondary); line-height: 1.4; }
.cause-card { display: grid; gap: .35rem; padding: 1rem; border: 1px solid var(--surface-border); border-radius: var(--content-border-radius); }
.cause-card span, .cause-card small { color: var(--text-color-secondary); line-height: 1.45; }
.endpoint-cell { min-width: 18rem; max-width: 32rem; display: grid; gap: .35rem; }
.endpoint-cell small { line-height: 1.35; }
.endpoint-link { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.endpoint-open-action { display: inline-flex; align-items: center; gap: .4rem; width: max-content; max-width: 100%; font-weight: 600; }
.technical-detail { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: .875rem; }
@media (max-width: 640px) { .incident-summary { grid-template-columns: 1fr; gap: .25rem; } .incident-summary dd { margin-bottom: .75rem; } }
</style>
