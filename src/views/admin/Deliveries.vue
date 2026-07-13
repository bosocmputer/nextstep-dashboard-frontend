<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, adminApi, type DeliveryPage } from '@/api';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';

type Delivery = DeliveryPage['data'][number];
const rows = ref<Delivery[]>([]); const loading = ref(false); const error = ref(''); const cursor = ref<string>(); const hasMore = ref(false); const tenantId = ref('');
const selected = ref<Delivery>(); let loadGeneration = 0; let controller: AbortController | undefined;
async function load(reset = true) { if (!reset && loading.value) return; if (reset) { loadGeneration++; controller?.abort('filters-changed'); controller = new AbortController(); } const context = loadGeneration; loading.value = true; error.value = ''; try { const page = await adminApi.deliveries({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value || undefined }, controller?.signal); if (context !== loadGeneration) return; rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); } finally { if (context === loadGeneration) loading.value = false; } }
function severity(value: string) { return value === 'ACCEPTED' ? 'success' : value === 'FAILED_PERMANENT' ? 'danger' : value === 'UNCERTAIN' ? 'warn' : value === 'SENDING' ? 'info' : 'secondary'; }
onMounted(() => load());
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="การส่ง LINE" subtitle="ประวัติการส่งเก็บ 365 วัน โดยไม่แสดง LINE user ID หรือเนื้อหาข้อความ" />
  <div class="card table-card">
    <Toolbar class="mb-6 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template><template #end><form class="flex flex-col md:flex-row gap-3" @submit.prevent="load()"><TenantFilterSelect v-model="tenantId" /><Button type="submit" label="กรอง" icon="pi pi-filter" /></form></template></Toolbar>
    <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
    <DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="tenantName" header="ร้านค้า" frozen><template #body="{ data }"><span class="font-semibold">{{ data.tenantName }}</span></template></Column>
      <Column field="recipientDisplayName" header="ผู้รับ"><template #body="{ data }"><span class="font-medium">{{ data.recipientDisplayName }}</span></template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="severity(data.status)" :value="statusLabel(data.status)" /></template></Column>
      <Column field="attempt" header="ครั้งที่ส่ง" header-class="table-number-column" body-class="table-number-column" />
      <Column field="createdAt" header="เริ่มส่งเมื่อ"><template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template></Column>
      <Column field="acceptedAt" header="LINE รับเมื่อ"><template #body="{ data }">{{ formatDateTime(data.acceptedAt) }}</template></Column>
      <Column header="" header-class="table-action-column" body-class="table-action-column"><template #body="{ data }"><Button icon="pi pi-info-circle" text rounded class="touch-action" aria-label="ดูรายละเอียดทางเทคนิค" v-tooltip.top="'รายละเอียดทางเทคนิค'" @click="selected = data" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการส่ง LINE</div></template>
    </DataTable>
    <div v-if="hasMore" class="table-footer text-center"><Button label="โหลดเพิ่มเติม" outlined :loading="loading" @click="load(false)" /></div>
  </div>
  <Dialog :visible="!!selected" modal header="รายละเอียดการส่ง LINE" class="responsive-dialog" :style="{ width: '32rem' }" @update:visible="selected = undefined"><dl v-if="selected" class="grid grid-cols-[8rem_1fr] gap-3 m-0"><dt>รหัสการส่ง</dt><dd class="technical-detail m-0">{{ selected.id }}</dd><dt>รหัสร้าน</dt><dd class="technical-detail m-0">{{ selected.tenantId }}</dd><dt>รหัสข้อผิดพลาด</dt><dd class="technical-detail m-0">{{ selected.safeErrorCode || '—' }}</dd><dt>หมดอายุ</dt><dd class="m-0">{{ formatDateTime(selected.expiresAt) }}</dd></dl></Dialog>
</template>
