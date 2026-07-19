<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';
import { ApiError, adminApi, reportDefinitionByKey, type DeliveryPage, type ReportKey } from '@/api';
import CursorPaginator from '@/components/admin/CursorPaginator.vue';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { toDateFilter } from '@/utils/adminTableFilters';
import { acceptCursorPage, createCursorPagination, moveCursorPage, resetCursorPagination, resizeCursorPagination } from '@/utils/cursorPagination';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';

type Delivery = DeliveryPage['data'][number];
const rows = ref<Delivery[]>([]); const loading = ref(false); const error = ref(''); const pagination = reactive(createCursorPagination()); const tenantId = ref('');
const status = ref<string>(); const dateFrom = ref<Date>(); const dateTo = ref<Date>();
const statuses = ['PENDING', 'SENDING', 'ACCEPTED', 'RETRY_WAIT', 'UNCERTAIN', 'FAILED_PERMANENT'].map((value) => ({ value, label: statusLabel(value) }));
const selected = ref<Delivery>(); let loadGeneration = 0; let controller: AbortController | undefined;
async function load(reset = false) { if (reset) resetCursorPagination(pagination); loadGeneration++; controller?.abort(reset ? 'filters-changed' : 'page-changed'); controller = new AbortController(); const context = loadGeneration; loading.value = true; error.value = ''; try { const page = await adminApi.deliveries({ cursor: pagination.cursor, pageSize: pagination.pageSize, tenantId: tenantId.value || undefined, status: status.value, dateFrom: toDateFilter(dateFrom.value), dateTo: toDateFilter(dateTo.value) }, controller.signal); if (context !== loadGeneration) return; rows.value = page.data; acceptCursorPage(pagination, page.page.nextCursor ?? undefined, page.page.hasMore); } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); } finally { if (context === loadGeneration) loading.value = false; } }
function changePage(direction: 'previous' | 'next') { if (moveCursorPage(pagination, direction)) void load(); }
function changePageSize(value: number) { resizeCursorPagination(pagination, value); void load(); }
function severity(value: string) { return value === 'ACCEPTED' ? 'success' : value === 'FAILED_PERMANENT' ? 'danger' : value === 'UNCERTAIN' ? 'warn' : value === 'SENDING' ? 'info' : 'secondary'; }
function reportLabel(reportKey: ReportKey) { return reportDefinitionByKey.get(reportKey)?.label ?? reportKey; }
function reportCount(delivery: Delivery) { return delivery.reportCount ?? delivery.reportKeys?.length ?? 0; }
onMounted(() => load(true));
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="การส่ง LINE" subtitle="ประวัติการส่งเก็บ 365 วัน โดยไม่แสดง LINE user ID หรือเนื้อหาข้อความ" />
  <div class="card table-card">
    <Toolbar class="mb-4 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template></Toolbar>
    <form class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4" aria-label="ตัวกรองประวัติการส่ง LINE" @submit.prevent="load(true)">
      <TenantFilterSelect v-model="tenantId" />
      <Select v-model="status" aria-label="กรองสถานะการส่ง LINE" :options="statuses" option-label="label" option-value="value" show-clear placeholder="ทุกสถานะ" />
      <DatePicker v-model="dateFrom" aria-label="กรองวันที่เริ่มต้น" date-format="dd/mm/yy" show-icon placeholder="ตั้งแต่วันที่" />
      <DatePicker v-model="dateTo" aria-label="กรองวันที่สิ้นสุด" date-format="dd/mm/yy" show-icon placeholder="ถึงวันที่" />
      <Button type="submit" label="ใช้ตัวกรอง" icon="pi pi-filter" />
    </form>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="tenantName" header="ร้านค้า" frozen><template #body="{ data }"><span class="font-semibold">{{ data.tenantName }}</span></template></Column>
      <Column field="recipientDisplayName" header="ผู้รับ"><template #body="{ data }"><span class="font-medium">{{ data.recipientDisplayName }}</span></template></Column>
      <Column field="reportCount" header="รายงานที่ส่งจริง" header-class="table-number-column" body-class="table-number-column"><template #body="{ data }"><Button :label="`${reportCount(data).toLocaleString('th-TH')} รายงาน`" size="small" text @click="selected = data" /></template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="severity(data.status)" :value="statusLabel(data.status)" /></template></Column>
      <Column field="attempt" header="ครั้งที่ส่ง" header-class="table-number-column" body-class="table-number-column" />
      <Column field="createdAt" header="เริ่มส่งเมื่อ"><template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template></Column>
      <Column field="acceptedAt" header="LINE รับเมื่อ"><template #body="{ data }">{{ formatDateTime(data.acceptedAt) }}</template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button icon="pi pi-info-circle" text rounded class="touch-action" aria-label="ดูรายละเอียดทางเทคนิค" v-tooltip.top="'รายละเอียดทางเทคนิค'" @click="selected = data" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการส่ง LINE</div></template>
    </DataTable>
    <CursorPaginator :page="pagination.page" :page-size="pagination.pageSize" :item-count="rows.length" :has-next="pagination.hasNext" :disabled="loading" @previous="changePage('previous')" @next="changePage('next')" @update:page-size="changePageSize" />
  </div>
  <Dialog :visible="!!selected" modal header="รายละเอียดการส่ง LINE" class="responsive-dialog" :style="{ width: '36rem' }" @update:visible="selected = undefined"><template v-if="selected"><section class="mb-5"><h3 class="text-base mt-0 mb-2">รายงานที่ส่งจริงในรอบนี้</h3><ol class="m-0 pl-5 grid gap-2"><li v-for="reportKey in selected.reportKeys" :key="reportKey">{{ reportLabel(reportKey) }}</li></ol></section><dl class="grid grid-cols-[8rem_1fr] gap-3 m-0"><dt>รหัสการส่ง</dt><dd class="technical-detail m-0">{{ selected.id }}</dd><dt>รหัสร้าน</dt><dd class="technical-detail m-0">{{ selected.tenantId }}</dd><dt>รหัสข้อผิดพลาด</dt><dd class="technical-detail m-0">{{ selected.safeErrorCode || '—' }}</dd><dt>หมดอายุ</dt><dd class="m-0">{{ formatDateTime(selected.expiresAt) }}</dd></dl></template></Dialog>
</template>
