<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import { adminApi, ApiError, type Recipient, type Schedule, type SMLConnectionStatus, type Tenant } from '@/api';
import { newIdempotencyKey } from '@/api/client';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';

const route = useRoute();
const router = useRouter();
const confirm = useConfirm();
const toast = useToast();
const tenantId = String(route.params.tenantId);
const activeTab = ref(typeof route.query.tab === 'string' ? route.query.tab : 'overview');
const tenant = ref<Tenant>();
const sml = ref<SMLConnectionStatus>();
const recipients = ref<Recipient[]>([]);
const schedules = ref<Schedule[]>([]);
const loading = ref(true);
const error = ref('');
const savingTenant = ref(false);
const testingSML = ref(false);
const savingSML = ref(false);
const inviteOpen = ref(false);
const inviteLabel = ref('');
const inviteURL = ref('');
const inviting = ref(false);
const testSendingScheduleId = ref('');
const changingScheduleId = ref('');
const tenantBaseline = ref('');
const smlBaseline = ref('');
const smlLoaded = ref(false);
let inviteActionKey = '';
const testSendActionKeys = new Map<string, string>();

const tenantForm = reactive({ name: '', status: 'DISABLED' as Tenant['status'], accessEndsAt: new Date(), version: 1 });
const smlForm = reactive({ endpointUrl: '', configFileName: 'config.xml', databaseName: '', version: 0 });
const tenantFingerprint = computed(() => JSON.stringify({ name: tenantForm.name.trim(), status: tenantForm.status, accessEndsAt: tenantForm.accessEndsAt.getTime() }));
const smlFingerprint = computed(() => JSON.stringify({ endpointUrl: smlForm.endpointUrl.trim(), configFileName: smlForm.configFileName.trim(), databaseName: smlForm.databaseName.trim() }));
const tenantDirty = computed(() => !!tenant.value && tenantFingerprint.value !== tenantBaseline.value);
const smlDirty = computed(() => smlLoaded.value && smlFingerprint.value !== smlBaseline.value);
const hasUnsavedChanges = computed(() => tenantDirty.value || smlDirty.value);

async function load() {
  loading.value = true; error.value = '';
  try {
    tenant.value = await adminApi.getTenant(tenantId);
    Object.assign(tenantForm, { name: tenant.value.name, status: tenant.value.status, accessEndsAt: new Date(tenant.value.accessEndsAt), version: tenant.value.version });
    tenantBaseline.value = tenantFingerprint.value;
    const [smlResult, recipientResult, scheduleResult] = await Promise.allSettled([
      adminApi.getSML(tenantId), adminApi.listRecipients(tenantId), adminApi.listSchedules(tenantId)
    ]);
    if (smlResult.status === 'fulfilled') {
      sml.value = smlResult.value;
      Object.assign(smlForm, { endpointUrl: '', configFileName: sml.value.configFileName ?? 'config.xml', databaseName: sml.value.databaseName ?? '', version: sml.value.version });
      smlBaseline.value = smlFingerprint.value;
      smlLoaded.value = true;
    } else if (smlResult.reason instanceof ApiError && smlResult.reason.status === 404) {
      smlBaseline.value = smlFingerprint.value; smlLoaded.value = true;
    } else throw smlResult.reason;
    recipients.value = recipientResult.status === 'fulfilled' ? recipientResult.value.data : [];
    schedules.value = scheduleResult.status === 'fulfilled' ? scheduleResult.value.data : [];
  } catch (cause) { error.value = errorMessage(cause); }
  finally { loading.value = false; }
}

function saveTenant() {
  if (!tenant.value || savingTenant.value || !tenantDirty.value) return;
  const statusChanged = tenantForm.status !== tenant.value.status;
  const accessShortened = tenantForm.accessEndsAt.getTime() < new Date(tenant.value.accessEndsAt).getTime();
  if (statusChanged || accessShortened) {
    confirm.require({
      header: 'ยืนยันการเปลี่ยนสิทธิ์ร้าน',
      message: tenantForm.status !== 'ACTIVE'
        ? 'การบันทึกจะหยุดการเปิด Dashboard รอบส่งรายงานใหม่ และการส่ง LINE ของร้านนี้ทันที'
        : 'คุณกำลังเปลี่ยนสถานะหรือย่อวันสิ้นสุดสิทธิ์ โปรดตรวจสอบวันที่ก่อนบันทึก',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'ยืนยันและบันทึก',
      rejectLabel: 'กลับไปตรวจสอบ',
      accept: () => persistTenant()
    });
    return;
  }
  void persistTenant();
}

async function persistTenant() {
  if (!tenant.value || savingTenant.value) return;
  savingTenant.value = true;
  try {
    const updated = await adminApi.updateTenant(tenantId, { ...tenantForm, timezone: 'Asia/Bangkok', accessEndsAt: tenantForm.accessEndsAt.toISOString() });
    tenant.value = updated; tenantForm.version = updated.version; tenantBaseline.value = tenantFingerprint.value;
    toast.add({ severity: 'success', summary: 'บันทึกร้านค้าแล้ว', life: 2500 });
  } catch (cause) { toast.add({ severity: 'error', summary: 'บันทึกไม่สำเร็จ', detail: errorMessage(cause), life: 5000 }); }
  finally { savingTenant.value = false; }
}

function saveSML() {
  if (savingSML.value || !smlDirty.value) return;
  if (sml.value?.isConfigured) {
    confirm.require({
      header: 'ยืนยันแทนที่การเชื่อมต่อ SML',
      message: 'ตารางส่งรายงานของร้านจะไม่พร้อม จนกว่าจะบันทึกและทดสอบการเชื่อมต่อใหม่ผ่าน',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'แทนที่การเชื่อมต่อ',
      rejectLabel: 'ยกเลิก',
      accept: () => persistSML()
    });
    return;
  }
  void persistSML();
}

async function persistSML() {
  if (savingSML.value) return;
  savingSML.value = true;
  try {
    sml.value = await adminApi.replaceSML(tenantId, { ...smlForm });
    Object.assign(smlForm, { endpointUrl: '', configFileName: sml.value.configFileName ?? smlForm.configFileName, databaseName: sml.value.databaseName ?? smlForm.databaseName, version: sml.value.version });
    smlBaseline.value = smlFingerprint.value;
    toast.add({ severity: 'success', summary: 'บันทึก SML แล้ว', detail: 'กรุณาทดสอบการเชื่อมต่อก่อนเปิดตารางส่งรายงาน', life: 4000 });
  } catch (cause) { toast.add({ severity: 'error', summary: 'บันทึก SML ไม่สำเร็จ', detail: errorMessage(cause), life: 5000 }); }
  finally { savingSML.value = false; }
}

async function testSML() {
  if (testingSML.value) return;
  if (smlDirty.value) { toast.add({ severity: 'warn', summary: 'ยังมีค่าที่ยังไม่บันทึก', detail: 'บันทึกการเชื่อมต่อก่อนทดสอบ เพื่อให้ระบบทดสอบค่าชุดล่าสุด', life: 4500 }); return; }
  testingSML.value = true;
  try {
    const result = await adminApi.testSML(tenantId);
    toast.add({ severity: 'success', summary: 'SML พร้อมใช้งาน', detail: `${result.latencyMs} ms`, life: 3500 });
    sml.value = await adminApi.getSML(tenantId);
  } catch (cause) { toast.add({ severity: 'error', summary: 'ทดสอบ SML ไม่ผ่าน', detail: errorMessage(cause), life: 6000 }); }
  finally { testingSML.value = false; }
}

async function invite() {
  if (!inviteLabel.value.trim() || inviting.value) return;
  inviting.value = true;
  try {
    inviteActionKey ||= newIdempotencyKey('recipient');
    const created = await adminApi.inviteRecipient(tenantId, inviteLabel.value.trim(), inviteActionKey);
    inviteActionKey = '';
    inviteURL.value = created.invitationUrl ?? '';
    recipients.value = (await adminApi.listRecipients(tenantId)).data;
    toast.add({ severity: 'success', summary: 'สร้างคำเชิญแล้ว', life: 2500 });
  } catch (cause) { if (!(cause instanceof ApiError) || !cause.retryable) inviteActionKey = ''; toast.add({ severity: 'error', summary: 'สร้างคำเชิญไม่สำเร็จ', detail: errorMessage(cause), life: 5000 }); }
  finally { inviting.value = false; }
}

async function copyInvite() {
  if (!inviteURL.value) return;
  await navigator.clipboard.writeText(inviteURL.value);
  toast.add({ severity: 'success', summary: 'คัดลอกลิงก์แล้ว', life: 2000 });
}

function editPermissions(item: Recipient) { void router.push({ name: 'admin-recipient-permissions', params: { tenantId, recipientId: item.id } }); }
function openSchedule(item?: Schedule) { void router.push(item ? { name: 'admin-schedule-edit', params: { tenantId, scheduleId: item.id } } : { name: 'admin-schedule-new', params: { tenantId } }); }

async function copySlug() {
  if (!tenant.value) return;
  await navigator.clipboard.writeText(tenant.value.slug);
  toast.add({ severity: 'success', summary: 'คัดลอกรหัสระบบแล้ว', life: 2000 });
}

async function changeScheduleState(item: Schedule) {
  if (changingScheduleId.value) return;
  changingScheduleId.value = item.id;
  try {
    if (item.status === 'ACTIVE') await adminApi.pauseSchedule(tenantId, item.id); else await adminApi.activateSchedule(tenantId, item.id);
    schedules.value = (await adminApi.listSchedules(tenantId)).data;
    toast.add({ severity: 'success', summary: item.status === 'ACTIVE' ? 'พักตารางส่งรายงานแล้ว' : 'เปิดตารางส่งรายงานแล้ว', life: 2500 });
  } catch (cause) { toast.add({ severity: 'error', summary: 'เปลี่ยนสถานะไม่ได้', detail: errorMessage(cause), life: 6000 }); }
  finally { changingScheduleId.value = ''; }
}

function confirmScheduleState(item: Schedule) {
  const activating = item.status !== 'ACTIVE';
  confirm.require({
    header: activating ? 'ยืนยันเปิดตารางส่งรายงาน' : 'ยืนยันพักตารางส่งรายงาน',
    message: activating
      ? `ระบบจะเริ่มรันตามรอบถัดไปของ “${item.name}”`
      : `ระบบจะหยุดรอบใหม่ของ “${item.name}” แต่ Run ที่กำลังทำงานจะไม่ถูกยกเลิก`,
    icon: activating ? 'pi pi-play' : 'pi pi-pause',
    acceptLabel: activating ? 'เปิดใช้งาน' : 'พักไว้',
    rejectLabel: 'ยกเลิก',
    accept: () => changeScheduleState(item)
  });
}

function confirmTestSchedule(item: Schedule) {
  if (item.readinessBlockers.length) {
    toast.add({ severity: 'warn', summary: 'ตารางส่งรายงานยังไม่พร้อม', detail: 'แก้ไขรายการความพร้อมก่อนทดสอบส่ง', life: 4500 });
    return;
  }
  confirm.require({
    header: 'ยืนยันส่ง LINE จริง',
    message: `ร้าน ${tenant.value?.name ?? ''} · ตาราง “${item.name}” · ${item.reportKeys.length} รายงาน · ผู้รับ ${item.recipientIds.length} คน ระบบจะดึง SQL ใหม่และส่ง LINE จริง ใช้ quota ของ OA กลาง และไม่เปลี่ยนรอบถัดไป`,
    icon: 'pi pi-send',
    acceptLabel: 'ดึงข้อมูลและส่งจริง',
    rejectLabel: 'ยกเลิก',
    accept: () => testSchedule(item)
  });
}

async function testSchedule(item: Schedule) {
  if (testSendingScheduleId.value) return;
  testSendingScheduleId.value = item.id;
  try {
    const actionKey = testSendActionKeys.get(item.id) ?? newIdempotencyKey('schedule-test-send');
    testSendActionKeys.set(item.id, actionKey);
    const execution = await adminApi.testSendSchedule(tenantId, item.id, actionKey);
    testSendActionKeys.delete(item.id);
    toast.add({ severity: 'success', summary: 'รับคำขอทดสอบส่งแล้ว', detail: `งาน ${execution.id} กำลังดึงข้อมูลและส่งในเบื้องหลัง`, life: 5000 });
  } catch (cause) {
    if (!(cause instanceof ApiError) || !cause.retryable) testSendActionKeys.delete(item.id);
    toast.add({ severity: 'error', summary: 'ทดสอบส่งไม่สำเร็จ', detail: errorMessage(cause), life: 6000 });
  } finally {
    testSendingScheduleId.value = '';
  }
}

function blockerLabel(code: string) {
  return ({ TENANT_INACTIVE: 'ร้านยังไม่เปิดใช้งานหรือหมดอายุ', SML_NOT_READY: 'SML ยังไม่พร้อม', RECIPIENT_NOT_ACTIVE: 'มีผู้รับที่ยังไม่ยืนยัน LINE', RECIPIENT_PERMISSION_MISMATCH: 'สิทธิ์ผู้รับไม่ตรงกับรายงาน', LINE_NOT_CONFIGURED: 'LINE OA ยังไม่พร้อม' } as Record<string, string>)[code] ?? code;
}
watch(inviteLabel, () => { if (!inviting.value) inviteActionKey = ''; });
function beforeUnload(event: BeforeUnloadEvent) { if (hasUnsavedChanges.value) { event.preventDefault(); event.returnValue = ''; } }
onBeforeRouteLeave(() => !hasUnsavedChanges.value || window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการออกจากหน้านี้หรือไม่'));
onMounted(() => { window.addEventListener('beforeunload', beforeUnload); void load(); });
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));
</script>

<template>
  <div v-if="loading" class="card"><Skeleton height="2rem" width="15rem" class="mb-4" /><Skeleton height="12rem" /></div>
  <Message v-else-if="error" severity="error" :closable="false">{{ error }} <Button label="ลองใหม่" text @click="load" /></Message>
  <template v-else-if="tenant">
    <div class="page-header"><div><Button label="ร้านค้าทั้งหมด" icon="pi pi-arrow-left" text class="-ml-3 mb-1" @click="router.push('/admin/tenants')" /><h1 class="page-title">{{ tenant.name }}</h1><p class="page-subtitle">เวลาไทย (UTC+7)</p></div><div class="flex gap-2"><Tag :severity="tenant.status === 'ACTIVE' ? 'success' : 'secondary'" :value="statusLabel(tenant.status)" /><Tag :severity="sml?.readinessStatus === 'READY' ? 'success' : 'warn'" :value="`SML ${statusLabel(sml?.readinessStatus ?? 'UNCONFIGURED')}`" /></div></div>
    <div class="card"><Tabs v-model:value="activeTab">
      <TabList><Tab value="overview">ข้อมูลร้าน</Tab><Tab value="sml">การเชื่อมต่อ SML</Tab><Tab value="recipients">ผู้รับและสิทธิ์</Tab><Tab value="schedules">ตารางส่งรายงาน</Tab></TabList>
      <TabPanels>
        <TabPanel value="overview"><form class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl" @submit.prevent="saveTenant"><div class="grid gap-2"><label for="tenant-name">ชื่อร้าน</label><InputText id="tenant-name" v-model="tenantForm.name" fluid /></div><div class="grid gap-2"><label for="tenant-status">สถานะ</label><Select input-id="tenant-status" aria-label="สถานะ" v-model="tenantForm.status" :options="['ACTIVE','DISABLED','EXPIRED']" fluid /></div><div class="grid gap-2"><label for="tenant-access-end">สิ้นสุดสิทธิ์ (เวลาไทย)</label><DatePicker input-id="tenant-access-end" v-model="tenantForm.accessEndsAt" show-icon show-time hour-format="24" fluid /></div><div class="md:col-span-2 flex items-center gap-3"><Button type="submit" label="บันทึกข้อมูลร้าน" icon="pi pi-save" :loading="savingTenant" :disabled="savingTenant || !tenantDirty" /><small v-if="tenantDirty" class="text-orange-600">มีการแก้ไขที่ยังไม่บันทึก</small></div></form><Accordion class="mt-6 max-w-4xl"><AccordionPanel value="technical"><AccordionHeader>ข้อมูลทางเทคนิค</AccordionHeader><AccordionContent><div class="flex flex-wrap items-center gap-3"><div><div class="text-sm text-muted-color">รหัสระบบ</div><code>{{ tenant.slug }}</code></div><Button label="คัดลอกรหัส" icon="pi pi-copy" text @click="copySlug" /></div></AccordionContent></AccordionPanel></Accordion></TabPanel>
        <TabPanel value="sml"><Message severity="info" :closable="false" class="mb-5">กรอก Base URL ของร้านได้ ระบบจะเติม <code>/SMLJavaWebService/DotNetFrameWork</code> ให้อัตโนมัติ และจะไม่แสดงรหัสผ่านหรือ token กลับมา</Message><form class="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-4xl" @submit.prevent="saveSML"><div class="grid gap-2 md:col-span-2"><label for="sml-endpoint">Java Web Service Base URL</label><InputText id="sml-endpoint" v-model="smlForm.endpointUrl" placeholder="http://shop.example.com:8092" fluid /></div><div class="grid gap-2"><label for="sml-config-file">ไฟล์ SMLConfig</label><InputText id="sml-config-file" v-model="smlForm.configFileName" placeholder="SMLConfigDATA.xml" fluid /></div><div class="grid gap-2"><label for="sml-database">ชื่อฐานข้อมูล SML</label><InputText id="sml-database" v-model="smlForm.databaseName" fluid /></div><div class="md:col-span-2 flex flex-wrap items-center gap-3"><Button type="submit" label="บันทึกการเชื่อมต่อ" icon="pi pi-save" :loading="savingSML" :disabled="savingSML || !smlDirty" /><span v-tooltip.top="smlDirty ? 'บันทึกค่าชุดล่าสุดก่อนทดสอบ' : !sml?.isConfigured ? 'ตั้งค่าและบันทึก SML ก่อนทดสอบ' : ''"><Button type="button" label="ทดสอบการเชื่อมต่อ" icon="pi pi-bolt" outlined :disabled="!sml?.isConfigured || smlDirty || savingSML" :loading="testingSML" @click="testSML" /></span><small v-if="smlDirty" class="text-orange-600">บันทึกค่าก่อนทดสอบการเชื่อมต่อ</small></div></form></TabPanel>
        <TabPanel value="recipients"><Toolbar class="mb-5 border-0 p-0"><template #start><div><h2 class="text-lg font-semibold m-0">ผู้รับและสิทธิ์รายงาน</h2><p class="text-muted-color mt-1 mb-0">ผู้รับต้องยืนยันผ่าน LINE ก่อนจึงจะส่งรายงานได้</p></div></template><template #end><Button label="เชิญผู้รับ" icon="pi pi-user-plus" @click="inviteOpen = true; inviteURL = ''" /></template></Toolbar><DataTable :value="recipients" data-key="id" striped-rows scrollable><Column field="displayName" header="ชื่อ" /><Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="data.status === 'ACTIVE' ? 'success' : 'warn'" :value="statusLabel(data.status)" /></template></Column><Column header="สิทธิ์"><template #body="{ data }"><span>{{ data.reportKeys.length }} รายงาน</span></template></Column><Column field="verifiedAt" header="ยืนยันเมื่อ"><template #body="{ data }">{{ formatDateTime(data.verifiedAt) }}</template></Column><Column header=""><template #body="{ data }"><Button label="กำหนดสิทธิ์" icon="pi pi-lock" text class="touch-action" @click="editPermissions(data)" /></template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีผู้รับ กด “เชิญผู้รับ” เพื่อเริ่มต้น</div></template></DataTable></TabPanel>
        <TabPanel value="schedules"><Toolbar class="mb-5 border-0 p-0"><template #start><p class="m-0 text-muted-color">หนึ่ง LINE Card รองรับสูงสุด 10 รายงาน รายงานละ 2 ตัวเลขสำคัญ</p></template><template #end><Button label="เพิ่มตารางส่งรายงาน" icon="pi pi-calendar-plus" @click="openSchedule()" /></template></Toolbar><DataTable :value="schedules" data-key="id" striped-rows scrollable><Column field="name" header="ชื่อตาราง"><template #body="{ data }"><span class="font-medium">{{ data.name }}</span><div class="text-xs text-muted-color mt-1">{{ data.localTime }} · เวลาไทย</div></template></Column><Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="data.status === 'ACTIVE' ? 'success' : data.status === 'PAUSED' ? 'warn' : 'secondary'" :value="statusLabel(data.status)" /></template></Column><Column header="รายงาน/ผู้รับ"><template #body="{ data }">{{ data.reportKeys.length }} / {{ data.recipientIds.length }}</template></Column><Column header="รอบถัดไป"><template #body="{ data }">{{ formatDateTime(data.nextOccurrences[0]) }}</template></Column><Column header="ความพร้อม"><template #body="{ data }"><div v-if="data.readinessBlockers.length" class="flex flex-wrap gap-1"><Tag v-for="code in data.readinessBlockers" :key="code" severity="danger" :value="blockerLabel(code)" /></div><Tag v-else severity="success" value="พร้อม" /></template></Column><Column header=""><template #body="{ data }"><div class="flex"><Button icon="pi pi-pencil" text rounded class="touch-action" aria-label="แก้ไข" v-tooltip.top="data.status === 'ACTIVE' ? 'พักตารางก่อนแก้ไข' : 'แก้ไขตาราง'" :disabled="data.status === 'ACTIVE' || !!changingScheduleId" @click="openSchedule(data)" /><Button icon="pi pi-send" text rounded class="touch-action" severity="info" aria-label="ทดสอบส่ง LINE" v-tooltip.top="data.readinessBlockers.length ? 'แก้ไขความพร้อมก่อนทดสอบส่ง' : 'ดึง SQL ใหม่และส่ง LINE จริง'" :disabled="data.readinessBlockers.length > 0 || !!testSendingScheduleId || !!changingScheduleId" :loading="testSendingScheduleId === data.id" @click="confirmTestSchedule(data)" /><Button :icon="data.status === 'ACTIVE' ? 'pi pi-pause' : 'pi pi-play'" text rounded class="touch-action" :severity="data.status === 'ACTIVE' ? 'warn' : 'success'" :aria-label="data.status === 'ACTIVE' ? 'พัก' : 'เปิด'" :loading="changingScheduleId === data.id" :disabled="!!changingScheduleId || !!testSendingScheduleId || (data.status !== 'ACTIVE' && data.readinessBlockers.length > 0)" @click="confirmScheduleState(data)" /></div></template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีตารางส่งรายงาน กด “เพิ่มตารางส่งรายงาน” เพื่อเริ่มต้น</div></template></DataTable></TabPanel>
      </TabPanels>
    </Tabs></div>
  </template>

  <Dialog v-model:visible="inviteOpen" modal header="เชิญผู้รับผ่าน LINE" class="responsive-dialog" :style="{ width: '32rem' }"><div v-if="!inviteURL" class="grid gap-3"><label for="recipient-invite-label">ชื่อที่ใช้ระบุก่อนผู้รับยืนยัน</label><InputText id="recipient-invite-label" v-model="inviteLabel" placeholder="เช่น เจ้าของร้าน" fluid /></div><div v-else><Message severity="success" :closable="false">ส่งลิงก์นี้ให้ผู้รับที่ต้องการเท่านั้น ลิงก์มีอายุ 7 วัน</Message><InputGroup class="mt-4"><InputText :model-value="inviteURL" aria-label="ลิงก์คำเชิญ" readonly /><Button icon="pi pi-copy" aria-label="คัดลอก" @click="copyInvite" /></InputGroup></div><template #footer><Button label="ปิด" text @click="inviteOpen = false" /><Button v-if="!inviteURL" label="สร้างลิงก์" icon="pi pi-link" :loading="inviting" @click="invite" /></template></Dialog>
</template>
