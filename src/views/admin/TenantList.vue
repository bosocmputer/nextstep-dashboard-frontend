<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { adminApi, type Tenant, type TenantInput } from '@/api';
import { errorMessage, formatDate } from '@/utils/format';

const router = useRouter();
const toast = useToast();
const tenants = ref<Tenant[]>([]);
const loading = ref(false);
const loadingMore = ref(false);
const error = ref('');
const cursor = ref<string | undefined>();
const hasMore = ref(false);
const search = ref('');
const status = ref<string | undefined>();
const createOpen = ref(false);
const saving = ref(false);
const createError = ref('');
const form = reactive<{ slug: string; name: string; timezone: string; accessEndsAt: Date }>({
  slug: '', name: '', timezone: 'Asia/Bangkok', accessEndsAt: new Date(new Date().setFullYear(new Date().getFullYear() + 1))
});
const statusOptions = [{ label: 'ทั้งหมด', value: undefined }, { label: 'ใช้งาน', value: 'ACTIVE' }, { label: 'ปิดใช้งาน', value: 'DISABLED' }, { label: 'หมดอายุ', value: 'EXPIRED' }];

async function load(reset = true) {
  if (reset) loading.value = true;
  else loadingMore.value = true;
  error.value = '';
  try {
    const page = await adminApi.listTenants({ cursor: reset ? undefined : cursor.value, pageSize: 25, status: status.value, search: search.value.trim() || undefined });
    tenants.value = reset ? page.data : [...tenants.value, ...page.data];
    cursor.value = page.page.nextCursor ?? undefined;
    hasMore.value = page.page.hasMore;
  } catch (cause) { error.value = errorMessage(cause); }
  finally { loading.value = false; loadingMore.value = false; }
}

async function createTenant() {
  createError.value = '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug) || !form.name.trim()) {
    createError.value = 'Slug ใช้ตัวพิมพ์เล็ก ตัวเลข และขีดกลางเท่านั้น และต้องระบุชื่อร้าน';
    return;
  }
  saving.value = true;
  try {
    const input: TenantInput = { slug: form.slug, name: form.name.trim(), timezone: form.timezone, accessEndsAt: form.accessEndsAt.toISOString() };
    const created = await adminApi.createTenant(input);
    createOpen.value = false;
    toast.add({ severity: 'success', summary: 'สร้างร้านค้าแล้ว', detail: created.name, life: 3000 });
    await router.push(`/admin/tenants/${created.id}`);
  } catch (cause) { createError.value = errorMessage(cause); }
  finally { saving.value = false; }
}

function statusSeverity(value: Tenant['status']) { return value === 'ACTIVE' ? 'success' : value === 'EXPIRED' ? 'danger' : 'secondary'; }
function statusLabel(value: Tenant['status']) { return value === 'ACTIVE' ? 'ใช้งาน' : value === 'EXPIRED' ? 'หมดอายุ' : 'ปิดใช้งาน'; }
onMounted(() => load());
</script>

<template>
  <div class="page-header"><div><h1 class="page-title">ร้านค้า</h1><p class="page-subtitle">Tenant, วันหมดอายุ และความพร้อมของ SML</p></div><Button label="เพิ่มร้านค้า" icon="pi pi-plus" @click="createOpen = true" /></div>
  <div class="surface-card rounded-xl p-4 mb-4">
    <form class="grid grid-cols-1 md:grid-cols-[1fr_14rem_auto] gap-3" @submit.prevent="load()">
      <IconField><InputIcon class="pi pi-search" /><InputText v-model="search" aria-label="ค้นหาร้านค้าด้วยชื่อหรือ slug" placeholder="ค้นหาชื่อหรือ slug" fluid /></IconField>
      <Select v-model="status" aria-label="กรองสถานะร้านค้า" :options="statusOptions" option-label="label" option-value="value" placeholder="ทุกสถานะ" fluid />
      <Button type="submit" label="ค้นหา" icon="pi pi-search" outlined />
    </form>
  </div>
  <Message v-if="error" severity="error" :closable="false" class="mb-4">{{ error }} <Button label="ลองใหม่" text size="small" @click="load()" /></Message>
  <div class="surface-card rounded-xl overflow-hidden">
    <DataTable :value="tenants" :loading="loading" data-key="id" striped-rows scrollable>
      <Column field="name" header="ร้านค้า" frozen><template #body="{ data }"><button class="text-left bg-transparent border-0 p-0 text-primary font-semibold cursor-pointer" @click="router.push(`/admin/tenants/${data.id}`)">{{ data.name }}</button><div class="text-xs text-muted-color mt-1">{{ data.slug }}</div></template></Column>
      <Column field="status" header="สถานะ"><template #body="{ data }"><Tag :severity="statusSeverity(data.status)" :value="statusLabel(data.status)" /></template></Column>
      <Column field="smlReadiness" header="SML"><template #body="{ data }"><Tag :severity="data.smlReadiness === 'READY' ? 'success' : data.smlReadiness === 'FAILED' ? 'danger' : 'warn'" :value="data.smlReadiness || 'UNCONFIGURED'" /></template></Column>
      <Column field="timezone" header="Timezone" />
      <Column field="accessEndsAt" header="สิ้นสุดสิทธิ์"><template #body="{ data }">{{ formatDate(data.accessEndsAt) }}</template></Column>
      <Column header=""><template #body="{ data }"><Button icon="pi pi-chevron-right" text rounded aria-label="เปิดร้าน" @click="router.push(`/admin/tenants/${data.id}`)" /></template></Column>
      <template #empty><div class="py-8 text-center text-muted-color">ไม่พบร้านค้าที่ตรงกับเงื่อนไข</div></template>
    </DataTable>
    <div v-if="hasMore" class="p-4 border-t border-surface text-center"><Button label="โหลดเพิ่มเติม" icon="pi pi-angle-down" outlined :loading="loadingMore" @click="load(false)" /></div>
  </div>

  <Dialog v-model:visible="createOpen" modal header="เพิ่มร้านค้า" class="responsive-dialog" :style="{ width: '34rem' }">
    <Message v-if="createError" severity="error" :closable="false" class="mb-4">{{ createError }}</Message>
    <form id="create-tenant" class="grid gap-4" @submit.prevent="createTenant">
      <div class="grid gap-2"><label for="tenant-name">ชื่อร้าน</label><InputText id="tenant-name" v-model="form.name" maxlength="160" fluid /></div>
      <div class="grid gap-2"><label for="tenant-slug">Slug</label><InputText id="tenant-slug" v-model="form.slug" maxlength="80" placeholder="my-shop" fluid /><small class="text-muted-color">ใช้ในระบบและ log ไม่ควรเปลี่ยนภายหลัง</small></div>
      <div class="grid gap-2"><label for="tenant-timezone">Timezone</label><Select input-id="tenant-timezone" aria-label="Timezone" v-model="form.timezone" :options="['Asia/Bangkok','Asia/Singapore','Asia/Tokyo']" fluid /></div>
      <div class="grid gap-2"><label for="tenant-expiry">วันสิ้นสุดสิทธิ์</label><DatePicker input-id="tenant-expiry" v-model="form.accessEndsAt" show-icon show-time hour-format="24" fluid /></div>
    </form>
    <template #footer><Button label="ยกเลิก" text @click="createOpen = false" /><Button type="submit" form="create-tenant" label="สร้างร้านค้า" icon="pi pi-check" :loading="saving" /></template>
  </Dialog>
</template>
