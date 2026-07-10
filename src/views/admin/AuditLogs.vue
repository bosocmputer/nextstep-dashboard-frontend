<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi, type AuditPage } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';

type Audit = AuditPage['data'][number];
const rows = ref<Audit[]>([]); const loading = ref(false); const error = ref(''); const cursor = ref<string>(); const hasMore = ref(false); const tenantId = ref('');
async function load(reset = true) { loading.value = true; error.value = ''; try { const page = await adminApi.audit({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value.trim() || undefined }); rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; } catch (cause) { error.value = errorMessage(cause); } finally { loading.value = false; } }
onMounted(() => load());
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">Audit Logs</h1><p class="page-subtitle">เหตุการณ์สำคัญแบบ redacted เก็บ 365 วัน</p></div><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></div>
  <form class="surface-card rounded-xl p-4 flex flex-col md:flex-row gap-3 mb-4" @submit.prevent="load()"><InputText v-model="tenantId" placeholder="Tenant UUID (ไม่บังคับ)" class="flex-1" /><Button type="submit" label="กรอง" icon="pi pi-filter" outlined /></form>
  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <div class="surface-card rounded-xl overflow-hidden"><DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable><Column field="createdAt" header="เวลา"><template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template></Column><Column field="actorType" header="Actor"><template #body="{ data }"><Tag severity="secondary" :value="data.actorType" /></template></Column><Column field="action" header="Action"><template #body="{ data }"><code>{{ data.action }}</code></template></Column><Column field="resourceType" header="Resource" /><Column field="resourceId" header="Resource ID"><template #body="{ data }"><code>{{ data.resourceId || '—' }}</code></template></Column><Column field="result" header="Result"><template #body="{ data }"><Tag :severity="data.result === 'SUCCESS' ? 'success' : data.result === 'DENIED' ? 'warn' : 'danger'" :value="data.result" /></template></Column><Column field="safeErrorCode" header="Safe error"><template #body="{ data }"><code>{{ data.safeErrorCode || '—' }}</code></template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มี Audit Event</div></template></DataTable><div v-if="hasMore" class="p-4 text-center border-t border-surface"><Button label="โหลดเพิ่มเติม" outlined @click="load(false)" /></div></div>
</template>
