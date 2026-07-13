<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { adminApi, ApiError, type AdminReportCatalog, type FlexPreview, type Recipient, type Schedule, type ScheduleInput, type Tenant } from '@/api';
import { newIdempotencyKey } from '@/api/client';
import LineFlexPreview from '@/components/LineFlexPreview.vue';
import ReportPickerPanel from '@/components/admin/ReportPickerPanel.vue';
import { loadAdminReportCatalog } from '@/stores/reportCatalog';
import { errorMessage, formatDateTime } from '@/utils/format';

const route = useRoute();
const router = useRouter();
const toast = useToast();
const tenantId = String(route.params.tenantId);
const scheduleId = route.params.scheduleId ? String(route.params.scheduleId) : '';
const editing = computed(() => !!scheduleId);
const tenant = ref<Tenant>();
const schedule = ref<Schedule>();
const recipients = ref<Recipient[]>([]);
const catalog = ref<AdminReportCatalog>();
const preview = ref<FlexPreview>();
const loading = ref(true);
const saving = ref(false);
const previewing = ref(false);
const error = ref('');
const baseline = ref('');
const controller = new AbortController();
let actionKey = '';
let previewController: AbortController | undefined;

const form = reactive<ScheduleInput>({ name: '', daysOfWeek: [1, 2, 3, 4, 5], localTime: '09:00', timezone: 'Asia/Bangkok', periodPreset: 'YESTERDAY', reportKeys: [], recipientIds: [] });
const days = [{ label: 'อาทิตย์', value: 0 }, { label: 'จันทร์', value: 1 }, { label: 'อังคาร', value: 2 }, { label: 'พุธ', value: 3 }, { label: 'พฤหัสบดี', value: 4 }, { label: 'ศุกร์', value: 5 }, { label: 'เสาร์', value: 6 }];
const presets = [
  { label: 'ข้อมูลของวันก่อนหน้า', value: 'YESTERDAY' },
  { label: 'วันนี้ถึงเวลาส่ง', value: 'TODAY_TO_NOW' },
  { label: 'ต้นเดือนถึงเวลาส่ง', value: 'MONTH_TO_DATE' },
  { label: 'สถานะ ณ เวลาส่ง', value: 'AS_OF_RUN' }
];
const fingerprint = computed(() => JSON.stringify({ ...form, daysOfWeek: [...form.daysOfWeek].sort(), reportKeys: [...form.reportKeys], recipientIds: [...form.recipientIds].sort() }));
const dirty = computed(() => !!baseline.value && fingerprint.value !== baseline.value);
const selectedRecipientSet = computed(() => new Set(form.recipientIds));
const maxReports = computed(() => catalog.value?.limits.maxScheduleReports ?? 10);
const missingByRecipient = computed(() => new Map(recipients.value.map((item) => [item.id, form.reportKeys.filter((key) => !item.reportKeys.includes(key))])));
const invalidSelectedRecipients = computed(() => form.recipientIds.filter((id) => (missingByRecipient.value.get(id)?.length ?? 0) > 0 || recipients.value.find((item) => item.id === id)?.status !== 'ACTIVE'));
const scheduleTimingValid = computed(() => form.daysOfWeek.length > 0 && /^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(form.localTime));
const definitionsByKey = computed(() => new Map(catalog.value?.data.map((item) => [item.reportKey, item]) ?? []));
const periodModesReady = computed(() => form.reportKeys.every((key) => ['DATE_RANGE', 'AS_OF_DATE', 'CURRENT_ONLY'].includes(definitionsByKey.value.get(key)?.periodMode ?? '')));
const previewReady = computed(() => scheduleTimingValid.value && form.reportKeys.length > 0 && form.reportKeys.length <= maxReports.value && periodModesReady.value);
const previewDisabledReason = computed(() => {
  if (!form.daysOfWeek.length) return 'เลือกวันส่งอย่างน้อย 1 วัน';
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(form.localTime)) return 'กรอกเวลาส่งให้ถูกต้อง เช่น 08:00';
  if (!form.reportKeys.length) return 'เลือกรายงานอย่างน้อย 1 รายงาน';
  if (!periodModesReady.value) return 'ข้อมูลความสามารถของรายงานไม่ครบ กรุณาโหลดหน้าใหม่ก่อน Preview หรือบันทึก';
  return '';
});
const valid = computed(() => form.name.trim().length > 0 && previewReady.value && form.recipientIds.length > 0 && invalidSelectedRecipients.value.length === 0);
const readOnly = computed(() => schedule.value?.status === 'ACTIVE');
const periodGroupCopy = computed(() => {
  const range: Record<string, string> = {
    YESTERDAY: 'ใช้ข้อมูลของวันก่อนรอบส่ง', TODAY_TO_NOW: `ใช้ข้อมูลตั้งแต่ต้นวันถึง ${form.localTime} น.`,
    MONTH_TO_DATE: `ใช้ข้อมูลตั้งแต่ต้นเดือนถึง ${form.localTime} น. ของวันส่ง`, AS_OF_RUN: `ใช้ข้อมูลของวันส่งถึง ${form.localTime} น.`
  };
  const asOf: Record<string, string> = {
    YESTERDAY: 'ใช้สถานะ ณ วันก่อนรอบส่ง', TODAY_TO_NOW: 'ใช้สถานะ ณ วันส่ง', MONTH_TO_DATE: 'ใช้สถานะ ณ วันส่ง', AS_OF_RUN: 'ใช้สถานะ ณ วันส่ง'
  };
  return [
    { mode: 'DATE_RANGE', title: 'รายงานแบบช่วงวันที่', detail: range[form.periodPreset] },
    { mode: 'AS_OF_DATE', title: 'รายงาน ณ วันที่', detail: asOf[form.periodPreset] },
    { mode: 'CURRENT_ONLY', title: 'รายงานสถานะปัจจุบัน', detail: `ใช้สถานะจริง ณ ${form.localTime} น. และไม่รองรับย้อนหลัง` }
  ].map((group) => ({ ...group, reports: form.reportKeys.map((key) => definitionsByKey.value.get(key)).filter((item) => item?.periodMode === group.mode) }));
});

async function load() {
  loading.value = true; error.value = '';
  try {
    const [tenantResult, recipientResult, catalogResult, scheduleResult] = await Promise.all([
      adminApi.getTenant(tenantId), adminApi.listRecipients(tenantId), loadAdminReportCatalog(controller.signal),
      scheduleId ? adminApi.getSchedule(tenantId, scheduleId, controller.signal) : Promise.resolve(undefined)
    ]);
    tenant.value = tenantResult; recipients.value = recipientResult.data; catalog.value = catalogResult; schedule.value = scheduleResult;
    if (scheduleResult) Object.assign(form, { name: scheduleResult.name, daysOfWeek: [...scheduleResult.daysOfWeek], localTime: scheduleResult.localTime, timezone: scheduleResult.timezone, periodPreset: scheduleResult.periodPreset, reportKeys: [...scheduleResult.reportKeys], recipientIds: [...scheduleResult.recipientIds] });
    baseline.value = fingerprint.value;
  } catch (cause) { error.value = errorMessage(cause); }
  finally { loading.value = false; }
}

function toggleRecipient(item: Recipient, checked: boolean) {
  if (checked) {
    if (item.status !== 'ACTIVE' || (missingByRecipient.value.get(item.id)?.length ?? 0) > 0) return;
    if (!selectedRecipientSet.value.has(item.id)) form.recipientIds = [...form.recipientIds, item.id];
  } else form.recipientIds = form.recipientIds.filter((id) => id !== item.id);
}

function removeInvalidRecipients() { form.recipientIds = form.recipientIds.filter((id) => !invalidSelectedRecipients.value.includes(id)); }

async function createPreview() {
	if (!previewReady.value) return;
	previewController?.abort('preview-replaced');
	const requestController = new AbortController();
	previewController = requestController;
  previewing.value = true;
  try {
    const result = await adminApi.previewSchedule(tenantId, { periodPreset: form.periodPreset, reportKeys: [...form.reportKeys], daysOfWeek: [...form.daysOfWeek], localTime: form.localTime, timezone: form.timezone }, requestController.signal);
    if (previewController === requestController) preview.value = result;
  }
  catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) toast.add({ severity: 'error', summary: 'สร้างตัวอย่างไม่สำเร็จ', detail: errorMessage(cause), life: 5000 }); }
  finally { if (previewController === requestController) previewing.value = false; }
}

async function save() {
  if (!valid.value || saving.value || readOnly.value) return;
  saving.value = true;
  try {
    let updated: Schedule;
    if (schedule.value) updated = await adminApi.updateSchedule(tenantId, schedule.value.id, { ...form, version: schedule.value.version });
    else {
      actionKey ||= newIdempotencyKey('schedule');
      updated = await adminApi.createSchedule(tenantId, { ...form }, actionKey);
      actionKey = '';
    }
    schedule.value = updated; baseline.value = fingerprint.value;
    toast.add({ severity: 'success', summary: 'บันทึกตารางส่งรายงานแล้ว', life: 3000 });
    back();
  } catch (cause) {
    if (!(cause instanceof ApiError) || !cause.retryable) actionKey = '';
    toast.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: errorMessage(cause), life: 6000 });
  } finally { saving.value = false; }
}

function back() { void router.push({ name: 'admin-tenant-detail', params: { tenantId }, query: { tab: 'schedules' } }); }
function beforeUnload(event: BeforeUnloadEvent) { if (dirty.value) { event.preventDefault(); event.returnValue = ''; } }
watch(() => [form.periodPreset, form.localTime, ...form.daysOfWeek, ...form.reportKeys], () => { previewController?.abort('preview-input-changed'); preview.value = undefined; });
watch(form, () => { if (!saving.value) actionKey = ''; }, { deep: true });
onBeforeRouteLeave(() => !dirty.value || window.confirm('มีตารางส่งรายงานที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่'));
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); void load(); });
onBeforeUnmount(() => { controller.abort('unmount'); previewController?.abort('unmount'); window.removeEventListener('beforeunload', beforeUnload); });
</script>

<template>
  <div v-if="loading" class="card"><Skeleton height="2rem" width="18rem" class="mb-4" /><Skeleton height="30rem" /></div>
  <Message v-else-if="error" severity="error" :closable="false">{{ error }} <Button label="ลองใหม่" text @click="load" /></Message>
  <template v-else-if="tenant && catalog">
    <AppPageHeader :title="editing ? 'แก้ไขตารางส่งรายงาน' : 'เพิ่มตารางส่งรายงาน'" :subtitle="`ร้าน ${tenant.name} · เวลาไทย`" mobile-mode="entity"><template #back><Button label="ตารางส่งรายงาน" icon="pi pi-arrow-left" text class="entity-back-action -ml-3 mb-1 touch-action" @click="back" /></template><template v-if="schedule" #actions><Tag :value="schedule.status === 'ACTIVE' ? 'กำลังใช้งาน' : 'ฉบับร่าง/พักไว้'" :severity="schedule.status === 'ACTIVE' ? 'success' : 'secondary'" /></template></AppPageHeader>
    <Message v-if="readOnly" severity="warn" :closable="false" class="mb-4">ตารางนี้กำลังใช้งาน กรุณากลับไปพักตารางก่อนแก้ไข</Message>
    <form class="flex flex-col gap-5" @submit.prevent="save">
      <div class="card">
        <h2 class="text-lg font-semibold mt-0 mb-5">รอบส่ง</h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl">
          <div class="grid gap-2 md:col-span-2"><label for="schedule-name">ชื่อตาราง</label><InputText id="schedule-name" v-model="form.name" :disabled="readOnly" fluid /></div>
          <div class="grid gap-2"><label for="schedule-days">วันส่ง</label><MultiSelect input-id="schedule-days" v-model="form.daysOfWeek" :options="days" option-label="label" option-value="value" display="chip" :disabled="readOnly" fluid /></div>
          <div class="grid gap-2"><label for="schedule-time">เวลาส่ง (เวลาไทย)</label><InputMask id="schedule-time" v-model="form.localTime" mask="99:99" placeholder="09:00" :disabled="readOnly" fluid /></div>
          <div class="grid gap-2">
            <label for="schedule-period">ข้อมูลที่นำมาสรุปใน LINE</label>
            <Select input-id="schedule-period" v-model="form.periodPreset" :options="presets" option-label="label" option-value="value" :disabled="readOnly" aria-describedby="schedule-period-help" fluid />
            <small id="schedule-period-help" class="text-muted-color">กำหนดช่วงของตัวเลขในรายงาน ไม่ใช่วันและเวลาที่ระบบส่ง LINE</small>
          </div>
          <div class="grid gap-2"><label>เขตเวลา</label><div class="timezone-static"><i class="pi pi-clock" /> เวลาไทย</div></div>
        </div>
        <Message v-if="!periodModesReady && form.reportKeys.length" severity="error" :closable="false" class="mt-4">ข้อมูลความสามารถของรายงานไม่ครบ ระบบจึงไม่คาดเดาช่วงข้อมูล กรุณาโหลดหน้าใหม่ก่อน Preview หรือบันทึก</Message>
        <div v-if="form.reportKeys.length" class="period-explanation mt-5" aria-live="polite">
          <div class="font-semibold mb-3">สรุปวิธีใช้ข้อมูลของรายงานที่เลือก</div>
          <div v-for="group in periodGroupCopy" :key="group.mode" class="period-explanation-row" :class="{ 'is-empty': !group.reports.length }">
            <div><strong>{{ group.title }}</strong><div class="text-sm text-muted-color">{{ group.detail }}</div></div>
            <span class="text-sm">{{ group.reports.length }} รายงาน</span>
          </div>
          <Message v-if="periodGroupCopy.find((group) => group.mode === 'CURRENT_ONLY')?.reports.length" severity="warn" :closable="false" class="mt-3">“สินค้าถึงจุดสั่งซื้อ” แสดงสถานะปัจจุบัน ณ เวลาส่งเสมอ จึงไม่สามารถดูย้อนหลังตามช่วงที่เลือกได้</Message>
        </div>
      </div>

      <div class="card"><div class="flex flex-wrap items-center justify-between gap-3 mb-5"><div><h2 class="text-lg font-semibold m-0">เลือกรายงาน</h2><p class="text-muted-color mt-1 mb-0">หนึ่ง LINE Card เลือกได้สูงสุด {{ maxReports }} รายงาน</p></div><Tag :value="`1 LINE Card · ${form.reportKeys.length}/${maxReports} รายงาน${preview ? ` · ${(preview.payloadBytes / 1024).toFixed(1)} KB / ${(catalog.limits.maxFlexPayloadBytes / 1024).toFixed(0)} KB` : ''}`" severity="info" /></div><ReportPickerPanel v-model="form.reportKeys" :definitions="catalog.data" :max-selected="maxReports" :disabled="readOnly" ordered /></div>

      <div class="card"><div class="flex flex-wrap items-center justify-between gap-3 mb-4"><div><h2 class="text-lg font-semibold m-0">เลือกผู้รับ</h2><p class="text-muted-color mt-1 mb-0">เลือกได้เฉพาะผู้ที่ยืนยัน LINE และมีสิทธิ์ครบทุกรายงาน</p></div><Button v-if="invalidSelectedRecipients.length" label="นำผู้รับที่ไม่พร้อมออก" icon="pi pi-user-minus" severity="warn" outlined class="touch-action" @click="removeInvalidRecipients" /></div><Message v-if="invalidSelectedRecipients.length" severity="error" :closable="false" class="mb-4">มีผู้รับที่เลือกไว้ {{ invalidSelectedRecipients.length }} คนซึ่งสิทธิ์ไม่ครบหรือยังไม่ยืนยัน LINE</Message><DataTable :value="recipients" data-key="id" striped-rows responsive-layout="scroll"><Column header="เลือก" style="width:5rem" header-class="table-select-column" body-class="table-select-column"><template #body="{ data }"><Checkbox :model-value="selectedRecipientSet.has(data.id)" binary :disabled="readOnly || data.status !== 'ACTIVE' || (missingByRecipient.get(data.id)?.length ?? 0) > 0" :aria-label="`เลือกผู้รับ ${data.displayName}`" @update:model-value="toggleRecipient(data, $event)" /></template></Column><Column field="displayName" header="ผู้รับ" /><Column header="ความพร้อม"><template #body="{ data }"><Tag v-if="data.status !== 'ACTIVE'" value="ยังไม่ยืนยัน LINE" severity="warn" /><Tag v-else-if="(missingByRecipient.get(data.id)?.length ?? 0) > 0" :value="`ขาดสิทธิ์ ${missingByRecipient.get(data.id)?.length} รายงาน`" severity="danger" /><Tag v-else value="พร้อม" severity="success" /></template></Column><Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button v-if="(missingByRecipient.get(data.id)?.length ?? 0) > 0" label="แก้สิทธิ์" icon="pi pi-lock" text class="touch-action" @click="router.push({ name: 'admin-recipient-permissions', params: { tenantId, recipientId: data.id } })" /></template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีผู้รับในร้านนี้</div></template></DataTable></div>

      <div v-if="preview" class="card"><div class="flex flex-wrap items-start justify-between gap-3 mb-4"><div><h2 class="text-lg font-semibold m-0">ตัวอย่าง LINE Card</h2><p class="text-sm text-muted-color mt-1 mb-0">ตัวอย่างรอบส่งถัดไป {{ formatDateTime(preview.exampleScheduledFor) }} · {{ preview.mixedPeriods ? 'แต่ละรายงานใช้ช่วงตามความสามารถจริง' : 'ทุกรายงานใช้ช่วงเดียวกัน' }}</p></div></div><LineFlexPreview :preview="preview" /></div>
      <div class="card"><div class="flex flex-wrap items-center justify-between gap-3"><small v-if="previewDisabledReason" class="text-muted-color"><i class="pi pi-info-circle mr-1" />{{ previewDisabledReason }}</small><span v-else /><div class="flex flex-wrap justify-end gap-2"><Button type="button" label="ยกเลิก" text class="touch-action" @click="back" /><Button type="button" label="ดูตัวอย่าง LINE Card" icon="pi pi-eye" outlined class="touch-action" :disabled="!previewReady" :loading="previewing" @click="createPreview" /><Button type="submit" label="บันทึกตารางส่ง" icon="pi pi-save" class="touch-action" :disabled="!valid || readOnly" :loading="saving" /></div></div></div>
    </form>
  </template>
</template>

<style scoped>
.timezone-static { min-height: 2.85rem; display: flex; align-items: center; gap: .65rem; padding: 0 .85rem; border: 1px solid var(--surface-border); border-radius: var(--content-border-radius); background: var(--surface-50); color: var(--text-color-secondary); }
:deep(.p-multiselect) { min-width: 0; max-width: 100%; }
:deep(.p-multiselect-display-chip .p-multiselect-label) { flex-wrap: wrap; }
.period-explanation { max-width: 64rem; padding: 1rem; border: 1px solid var(--surface-border); border-radius: var(--content-border-radius); background: var(--surface-50); }
.period-explanation-row { display: flex; align-items: start; justify-content: space-between; gap: 1rem; padding-block: .7rem; border-bottom: 1px solid var(--surface-border); }
.period-explanation-row:last-of-type { border-bottom: 0; }
.period-explanation-row.is-empty { opacity: .55; }
</style>
