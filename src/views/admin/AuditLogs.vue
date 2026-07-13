<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { ApiError, adminApi, type AuditPage } from '@/api';
import TenantFilterSelect from '@/components/admin/TenantFilterSelect.vue';
import { errorMessage, formatDateTime } from '@/utils/format';
import { auditActionLabel, statusLabel } from '@/utils/status';

type Audit = AuditPage['data'][number];
const rows = ref<Audit[]>([]); const loading = ref(false); const error = ref(''); const cursor = ref<string>(); const hasMore = ref(false); const tenantId = ref('');
const selected = ref<Audit>(); let loadGeneration = 0; let controller: AbortController | undefined;
async function load(reset = true) { if (!reset && loading.value) return; if (reset) { loadGeneration++; controller?.abort('filters-changed'); controller = new AbortController(); } const context = loadGeneration; loading.value = true; error.value = ''; try { const page = await adminApi.audit({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value || undefined }, controller?.signal); if (context !== loadGeneration) return; rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; } catch (cause) { if (!(cause instanceof ApiError && cause.code === 'CANCELLED')) error.value = errorMessage(cause); } finally { if (context === loadGeneration) loading.value = false; } }
onMounted(() => load());
onBeforeUnmount(() => controller?.abort('unmounted'));
</script>

<template>
  <AppPageHeader title="ประวัติการใช้งาน" subtitle="ใครทำอะไร เมื่อใด และได้ผลอย่างไร · เก็บ 365 วัน" />
  <div class="card table-card">
    <Toolbar class="mb-6 border-0 p-0"><template #start><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></template><template #end><form class="flex flex-col md:flex-row gap-3" @submit.prevent="load()"><TenantFilterSelect v-model="tenantId" /><Button type="submit" label="กรอง" icon="pi pi-filter" /></form></template></Toolbar>
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
    <div v-if="hasMore" class="table-footer text-center"><Button label="โหลดเพิ่มเติม" outlined :loading="loading" @click="load(false)" /></div>
  </div>
  <Dialog :visible="!!selected" modal header="รายละเอียดเหตุการณ์" class="responsive-dialog" :style="{ width: '34rem' }" @update:visible="selected = undefined"><dl v-if="selected" class="grid grid-cols-[9rem_1fr] gap-3 m-0"><dt>รหัสเหตุการณ์</dt><dd class="technical-detail m-0">{{ selected.id }}</dd><dt>รหัสร้าน</dt><dd class="technical-detail m-0">{{ selected.tenantId || '—' }}</dd><dt>รหัสการทำงาน</dt><dd class="technical-detail m-0">{{ selected.action }}</dd><dt>ประเภทข้อมูล</dt><dd class="technical-detail m-0">{{ selected.resourceType }}</dd><dt>รหัสข้อมูล</dt><dd class="technical-detail m-0">{{ selected.resourceId || '—' }}</dd><dt>รหัสข้อผิดพลาด</dt><dd class="technical-detail m-0">{{ selected.safeErrorCode || '—' }}</dd></dl></Dialog>
</template>
