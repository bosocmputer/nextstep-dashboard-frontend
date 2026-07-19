<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ApiError, adminApi, type AuditPage } from '@/api';
import CursorPaginator from '@/components/admin/CursorPaginator.vue';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { normalizedAuditAction, toDateFilter } from '@/utils/adminTableFilters';
import { acceptCursorPage, createCursorPagination, moveCursorPage, resetCursorPagination, resizeCursorPagination } from '@/utils/cursorPagination';
import { errorMessage, formatDateTime } from '@/utils/format';
import { auditActionLabel, statusLabel } from '@/utils/status';

type Audit = AuditPage['data'][number];
const rows = ref<Audit[]>([]); const loading = ref(false); const error = ref(''); const pagination = reactive(createCursorPagination()); const tenantId = ref('');
const actorType = ref<string>(); const action = ref(''); const result = ref<string>(); const dateFrom = ref<Date>(); const dateTo = ref<Date>();
const actorTypes = ['ADMIN', 'VIEWER', 'WORKER', 'SYSTEM'].map((value) => ({ value, label: statusLabel(value) }));
const results = ['SUCCESS', 'DENIED', 'FAILED'].map((value) => ({ value, label: statusLabel(value) }));
const selected = ref<Audit>(); let loadGeneration = 0; let controller: AbortController | undefined;
async function load(reset = false) { if (reset) resetCursorPagination(pagination); loadGeneration++; controller?.abort(reset ? 'filters-changed' : 'page-changed'); controller = new AbortController(); const context = loadGeneration; loading.value = true; error.value = ''; try { const page = await adminApi.audit({ cursor: pagination.cursor, pageSize: pagination.pageSize, tenantId: tenantId.value || undefined, actorType: actorType.value, action: normalizedAuditAction(action.value), result: result.value, dateFrom: toDateFilter(dateFrom.value), dateTo: toDateFilter(dateTo.value) }, controller.signal); if (context !== loadGeneration) return; rows.value = page.data; acceptCursorPage(pagination, page.page.nextCursor ?? undefined, page.page.hasMore); } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); } finally { if (context === loadGeneration) loading.value = false; } }
function changePage(direction: 'previous' | 'next') { if (moveCursorPage(pagination, direction)) void load(); }
function changePageSize(value: number) { resizeCursorPagination(pagination, value); void load(); }
onMounted(() => load(true));
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="ประวัติการใช้งาน" subtitle="ใครทำอะไร เมื่อใด และได้ผลอย่างไร · เก็บ 365 วัน" />
  <div class="card table-card">
    <Toolbar class="mb-4 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template></Toolbar>
    <form class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7 gap-3 mb-4" aria-label="ตัวกรองประวัติการใช้งาน" @submit.prevent="load(true)">
      <TenantFilterSelect v-model="tenantId" />
      <Select v-model="actorType" aria-label="กรองผู้ดำเนินการ" :options="actorTypes" option-label="label" option-value="value" show-clear placeholder="ผู้ดำเนินการทั้งหมด" />
      <InputText v-model="action" aria-label="กรองรหัสการทำงาน" maxlength="100" placeholder="การทำงาน เช่น TENANT_UPDATED" />
      <Select v-model="result" aria-label="กรองผลลัพธ์" :options="results" option-label="label" option-value="value" show-clear placeholder="ทุกผลลัพธ์" />
      <DatePicker v-model="dateFrom" aria-label="กรองวันที่เริ่มต้น" date-format="dd/mm/yy" show-icon placeholder="ตั้งแต่วันที่" />
      <DatePicker v-model="dateTo" aria-label="กรองวันที่สิ้นสุด" date-format="dd/mm/yy" show-icon placeholder="ถึงวันที่" />
      <Button type="submit" label="ใช้ตัวกรอง" icon="pi pi-filter" />
    </form>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="tenantName" header="ร้านค้า" frozen><template #body="{ data }"><span class="font-semibold">{{ data.tenantName || 'ระบบส่วนกลาง' }}</span></template></Column>
      <Column field="createdAt" header="เวลา"><template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template></Column>
      <Column field="actorType" header="ผู้ดำเนินการ"><template #body="{ data }"><Tag severity="secondary" :value="statusLabel(data.actorType)" /></template></Column>
      <Column field="action" header="การทำงาน"><template #body="{ data }"><span class="font-medium">{{ auditActionLabel(data.action) }}</span></template></Column>
      <Column field="result" header="ผลลัพธ์"><template #body="{ data }"><Tag :severity="data.result === 'SUCCESS' ? 'success' : data.result === 'DENIED' ? 'warn' : 'danger'" :value="statusLabel(data.result)" /></template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button icon="pi pi-info-circle" text rounded class="touch-action" aria-label="ดูรายละเอียดทางเทคนิค" v-tooltip.top="'รายละเอียดทางเทคนิค'" @click="selected = data" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการใช้งาน</div></template>
    </DataTable>
    <CursorPaginator :page="pagination.page" :page-size="pagination.pageSize" :item-count="rows.length" :has-next="pagination.hasNext" :disabled="loading" @previous="changePage('previous')" @next="changePage('next')" @update:page-size="changePageSize" />
  </div>
  <Dialog :visible="!!selected" modal header="รายละเอียดเหตุการณ์" class="responsive-dialog" :style="{ width: '34rem' }" @update:visible="selected = undefined"><dl v-if="selected" class="grid grid-cols-[9rem_1fr] gap-3 m-0"><dt>รหัสเหตุการณ์</dt><dd class="technical-detail m-0">{{ selected.id }}</dd><dt>รหัสร้าน</dt><dd class="technical-detail m-0">{{ selected.tenantId || '—' }}</dd><dt>รหัสการทำงาน</dt><dd class="technical-detail m-0">{{ selected.action }}</dd><dt>ประเภทข้อมูล</dt><dd class="technical-detail m-0">{{ selected.resourceType }}</dd><dt>รหัสข้อมูล</dt><dd class="technical-detail m-0">{{ selected.resourceId || '—' }}</dd><dt>รหัสข้อผิดพลาด</dt><dd class="technical-detail m-0">{{ selected.safeErrorCode || '—' }}</dd></dl></Dialog>
</template>
