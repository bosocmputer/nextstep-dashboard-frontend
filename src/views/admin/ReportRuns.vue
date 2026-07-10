<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi, reportDefinitionByKey, type ReportRun } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';
import { statusLabel } from '@/utils/status';

const rows = ref<ReportRun[]>([]);
const loading = ref(false);
const error = ref('');
const cursor = ref<string>();
const hasMore = ref(false);
const status = ref<string>();
const tenantId = ref('');
const statuses = ['QUEUED', 'CLAIMED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'EXPIRED'].map((value) => ({ value, label: statusLabel(value) }));

async function load(reset = true) {
  loading.value = true; error.value = '';
  try {
    const page = await adminApi.reportRuns({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value.trim() || undefined, status: status.value });
    rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore;
  } catch (cause) { error.value = errorMessage(cause); }
  finally { loading.value = false; }
}
function severity(value: string) { return value === 'SUCCEEDED' ? 'success' : value === 'FAILED' ? 'danger' : value === 'RUNNING' || value === 'CLAIMED' ? 'info' : value === 'QUEUED' ? 'warn' : 'secondary'; }
onMounted(() => load());
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">การสร้างรายงาน</h1><p class="page-subtitle">ตรวจคิว ผลการทำงาน จำนวนแถว และรหัสข้อผิดพลาดโดยไม่แสดงข้อมูลลับ</p></div><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></div>
  <form class="surface-card rounded-xl p-4 grid grid-cols-1 md:grid-cols-[1fr_14rem_auto] gap-3 mb-4" @submit.prevent="load()"><InputText v-model="tenantId" aria-label="กรองด้วยรหัสร้าน" placeholder="รหัสร้าน (ไม่บังคับ)" fluid /><Select v-model="status" aria-label="กรองสถานะการสร้างรายงาน" :options="statuses" option-label="label" option-value="value" show-clear placeholder="ทุกสถานะ" fluid /><Button type="submit" label="กรอง" icon="pi pi-filter" outlined /></form>
  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <div class="surface-card rounded-xl overflow-hidden"><DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable><Column field="reportKey" header="รายงาน" frozen><template #body="{ data }"><div class="font-medium">{{ reportDefinitionByKey.get(data.reportKey)?.label ?? data.reportKey }}</div><code class="text-xs text-muted-color">{{ data.id }}</code></template></Column><Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="severity(data.status)" :value="statusLabel(data.status)" /></template></Column><Column header="ช่วงข้อมูล"><template #body="{ data }">{{ data.dateFrom || '—' }}<span v-if="data.dateTo && data.dateTo !== data.dateFrom"> → {{ data.dateTo }}</span></template></Column><Column field="rowCount" header="จำนวนแถว"><template #body="{ data }"><span class="metric-value">{{ data.rowCount.toLocaleString('th-TH') }}</span></template></Column><Column field="safeErrorCode" header="รหัสข้อผิดพลาด"><template #body="{ data }"><code v-if="data.safeErrorCode" class="text-red-600">{{ data.safeErrorCode }}</code><span v-else>—</span></template></Column><Column field="queuedAt" header="เข้าคิวเมื่อ"><template #body="{ data }">{{ formatDateTime(data.queuedAt) }}</template></Column><Column field="finishedAt" header="เสร็จเมื่อ"><template #body="{ data }">{{ formatDateTime(data.finishedAt) }}</template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มีประวัติการสร้างรายงาน</div></template></DataTable><div v-if="hasMore" class="p-4 border-t border-surface text-center"><Button label="โหลดเพิ่มเติม" outlined :loading="loading" @click="load(false)" /></div></div>
</template>
