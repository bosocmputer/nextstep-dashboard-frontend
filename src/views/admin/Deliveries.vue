<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { adminApi, type DeliveryPage } from '@/api';
import { errorMessage, formatDateTime } from '@/utils/format';

type Delivery = DeliveryPage['data'][number];
const rows = ref<Delivery[]>([]); const loading = ref(false); const error = ref(''); const cursor = ref<string>(); const hasMore = ref(false); const tenantId = ref('');
async function load(reset = true) { loading.value = true; error.value = ''; try { const page = await adminApi.deliveries({ cursor: reset ? undefined : cursor.value, tenantId: tenantId.value.trim() || undefined }); rows.value = reset ? page.data : [...rows.value, ...page.data]; cursor.value = page.page.nextCursor ?? undefined; hasMore.value = page.page.hasMore; } catch (cause) { error.value = errorMessage(cause); } finally { loading.value = false; } }
function severity(value: string) { return value === 'ACCEPTED' ? 'success' : value === 'FAILED_PERMANENT' ? 'danger' : value === 'UNCERTAIN' ? 'warn' : value === 'SENDING' ? 'info' : 'secondary'; }
onMounted(() => load());
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">LINE Deliveries</h1><p class="page-subtitle">Delivery metadata เก็บ 365 วัน; ไม่แสดง LINE user ID หรือ message payload</p></div><Button label="รีเฟรช" icon="pi pi-refresh" outlined :loading="loading" @click="load()" /></div>
  <form class="surface-card rounded-xl p-4 flex flex-col md:flex-row gap-3 mb-4" @submit.prevent="load()"><InputText v-model="tenantId" placeholder="Tenant UUID (ไม่บังคับ)" class="flex-1" /><Button type="submit" label="กรอง" icon="pi pi-filter" outlined /></form>
  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }}</Message>
  <div class="surface-card rounded-xl overflow-hidden"><DataTable :value="rows" :loading="loading" data-key="id" striped-rows scrollable><Column field="id" header="Delivery"><template #body="{ data }"><code>{{ data.id }}</code></template></Column><Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="severity(data.status)" :value="data.status" /></template></Column><Column field="attempt" header="Attempts" /><Column field="safeErrorCode" header="Safe error"><template #body="{ data }"><code v-if="data.safeErrorCode" class="text-red-600">{{ data.safeErrorCode }}</code><span v-else>—</span></template></Column><Column field="createdAt" header="สร้างเมื่อ"><template #body="{ data }">{{ formatDateTime(data.createdAt) }}</template></Column><Column field="acceptedAt" header="LINE รับเมื่อ"><template #body="{ data }">{{ formatDateTime(data.acceptedAt) }}</template></Column><template #empty><div class="py-8 text-center text-muted-color">ยังไม่มี Delivery</div></template></DataTable><div v-if="hasMore" class="p-4 text-center border-t border-surface"><Button label="โหลดเพิ่มเติม" outlined @click="load(false)" /></div></div>
</template>
