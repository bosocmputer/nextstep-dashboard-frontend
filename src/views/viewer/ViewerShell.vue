<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import liff from '@line/liff';
import { ApiError, reportDefinitionByKey, viewerApi } from '@/api';
import AppShell from '@/layout/AppShell.vue';
import type { NavigationItem } from '@/layout/menu';
import { useViewerSession } from '@/stores/viewer';
import { reportIcon } from '@/utils/dashboard';
import { errorMessage } from '@/utils/format';
import { cleanViewerQuery } from '@/utils/viewerSnapshot';

const route = useRoute(); const router = useRouter();
const toast = useToast();
const { state, loadViewer, setViewer, setTenants, selectTenant, ensureReports, clearViewer } = useViewerSession();
const stage = ref<'loading' | 'ready' | 'error'>('loading'); const message = ref('');
const switchingTenantId = ref('');
const selectedTenant = computed(() => state.tenants.find((tenant) => tenant.id === state.selectedTenantId));
const routeTenant = computed(() => typeof route.params.tenantId === 'string' ? state.tenants.find((tenant) => tenant.id === route.params.tenantId) : selectedTenant.value);
const contextTenantId = computed(() => routeTenant.value?.id ?? state.selectedTenantId);
const selectedTenantId = computed({
  get: () => switchingTenantId.value || state.selectedTenantId,
  set: (tenantId: string) => { void switchTenant(tenantId); }
});
const tenantOptions = computed(() => [...state.tenants]);
const availableReports = computed(() => state.reportsByTenant[contextTenantId.value]
  ?? routeTenant.value?.reportKeys.map((reportKey) => reportDefinitionByKey.get(reportKey)).filter((item) => item !== undefined)
  ?? []);
const mobileTitle = computed(() => {
  if (switchingTenantId.value) return 'กำลังเปลี่ยนร้าน';
  if (typeof route.params.tenantId === 'string' && !routeTenant.value) return 'กำลังเปลี่ยนร้าน';
  return routeTenant.value?.name ?? 'Nextstep Dashboard';
});
const mobileSubtitle = computed(() => {
  if (route.name === 'viewer-overview') return 'ภาพรวม';
  if (route.name === 'viewer-report') {
    const key = typeof route.params.reportKey === 'string' ? route.params.reportKey : '';
    return availableReports.value.find((report) => report.reportKey === key)?.label ?? 'รายงาน';
  }
  return 'Dashboard';
});
const mobileHomeTo = computed(() => routeTenant.value ? `/app/tenant/${routeTenant.value.id}` : '/app');
const menuModel = computed<NavigationItem[]>(() => [
  { label: 'ภาพรวมผู้บริหาร', items: [
    { label: 'ภาพรวมร้าน', icon: 'pi pi-fw pi-home', to: contextTenantId.value ? `/app/tenant/${contextTenantId.value}` : '/app' }
  ] },
  { label: 'รายงาน', items: availableReports.value.map((report) => ({
    label: report.label,
    icon: reportIcon(report.reportKey),
    to: `/app/tenant/${contextTenantId.value}/report/${report.reportKey}`
  })) }
]);

async function prepareTenantContext() {
  const routeTenantId = typeof route.params.tenantId === 'string' ? route.params.tenantId : '';
  const tenantId = state.tenants.some((tenant) => tenant.id === routeTenantId) ? routeTenantId : state.selectedTenantId || state.tenants[0]?.id || '';
  if (!tenantId) return;
  selectTenant(tenantId);
  await ensureReports(tenantId);
  if (routeTenantId && routeTenantId !== tenantId) await router.replace(`/app/tenant/${tenantId}`);
}

async function initialize() {
  stage.value = 'loading'; message.value = '';
  const invitationReference = route.path.endsWith('/invite') && typeof route.query.ref === 'string' ? route.query.ref : undefined;
  const deliveryReference = typeof route.query.deliveryRef === 'string' ? route.query.deliveryRef : undefined;
  try {
    try {
      await loadViewer(); await prepareTenantContext();
      if (deliveryReference) await removeDeliveryReference();
      stage.value = 'ready'; return;
    }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) throw cause; }
    const liffId = import.meta.env.VITE_LINE_LIFF_ID;
    if (!liffId || liffId.startsWith('replace-')) throw new Error('ยังไม่ได้ตั้งค่า LINE LIFF ID สำหรับ environment นี้');
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('LINE ไม่ส่ง ID token กรุณาเปิดผ่าน LINE อีกครั้ง');
    const me = await viewerApi.exchange(idToken, invitationReference, deliveryReference);
    setViewer(me); setTenants((await viewerApi.tenants()).data); await prepareTenantContext();
    if (invitationReference) await router.replace({ path: '/app' });
    else if (deliveryReference) await removeDeliveryReference();
    stage.value = 'ready';
  } catch (cause) {
    stage.value = 'error';
    if (cause instanceof ApiError && cause.code === 'DELIVERY_REFERENCE_FORBIDDEN') message.value = 'ลิงก์รายงานนี้เป็นของ LINE บัญชีอื่น จึงไม่สามารถเปิดได้';
    else if (cause instanceof ApiError && cause.code === 'LINE_IDENTITY_FORBIDDEN') message.value = 'LINE บัญชีนี้ยังไม่ได้รับเชิญหรือถูกยกเลิกสิทธิ์';
    else message.value = errorMessage(cause);
  }
}

async function removeDeliveryReference() {
  await router.replace({ path: route.path, query: cleanViewerQuery(route.query), hash: route.hash });
}

async function switchTenant(tenantId: string) {
  if (!tenantId || tenantId === state.selectedTenantId && route.params.tenantId === tenantId) return;
  switchingTenantId.value = tenantId;
  try {
    await ensureReports(tenantId);
    selectTenant(tenantId);
    await router.push(`/app/tenant/${tenantId}`);
  } catch (cause) { toast.add({ severity: 'error', summary: 'เปลี่ยนร้านไม่สำเร็จ', detail: errorMessage(cause), life: 4500 }); }
  finally { if (switchingTenantId.value === tenantId) switchingTenantId.value = ''; }
}

async function logout() {
  try { await viewerApi.logout(); } finally { clearViewer(); await router.replace('/app'); await initialize(); }
}
function handleUnauthorized(event: Event) {
  if ((event as CustomEvent<{ scope?: string }>).detail?.scope !== 'viewer' || stage.value !== 'ready') return;
  clearViewer(); stage.value = 'error'; message.value = 'Session LINE หมดอายุ กรุณากด “ลองใหม่” เพื่อยืนยันตัวตนอีกครั้ง';
}
onMounted(() => { window.addEventListener('nextstep:unauthorized', handleUnauthorized); void initialize(); });
onBeforeUnmount(() => window.removeEventListener('nextstep:unauthorized', handleUnauthorized));
watch(() => route.params.tenantId, (tenantId) => {
  if (stage.value === 'ready' && typeof tenantId === 'string' && state.tenants.some((item) => item.id === tenantId) && tenantId !== state.selectedTenantId) {
    selectTenant(tenantId);
    void ensureReports(tenantId).catch((cause) => { toast.add({ severity: 'error', summary: 'โหลดสิทธิ์รายงานไม่สำเร็จ', detail: errorMessage(cause), life: 4500 }); });
  }
});
</script>

<template>
  <div v-if="stage !== 'ready'" class="viewer-gate min-h-screen grid place-items-center px-4 bg-surface-50 dark:bg-surface-950">
    <div v-if="stage === 'loading'" class="w-full max-w-2xl card"><div class="flex flex-col items-center text-center gap-3 mb-5 py-2"><ProgressSpinner style="width: 2.5rem; height: 2.5rem" stroke-width="6" /><div><h1 class="text-xl font-semibold m-0">กำลังยืนยัน LINE</h1><p class="text-muted-color mt-1 mb-0">ตรวจสอบตัวตนและสิทธิ์ล่าสุด</p></div></div><Skeleton height="10rem" /></div>
    <section v-else class="w-full max-w-xl card text-center"><i class="pi pi-shield text-5xl text-red-500" /><h1 class="text-2xl font-bold mb-2">ไม่สามารถเปิด Dashboard</h1><p class="text-muted-color safe-wrap">{{ message }}</p><Button label="ลองใหม่" icon="pi pi-refresh" class="mt-4" @click="initialize" /></section>
  </div>
  <AppShell v-else :menu-model="menuModel" :home-to="selectedTenant ? `/app/tenant/${selectedTenant.id}` : '/app'" :mobile-title="mobileTitle" :mobile-subtitle="mobileSubtitle" :mobile-home-to="mobileHomeTo" :account-label="state.me?.displayName" confirm-dialogs @sign-out="logout">
    <template #topbar-context>
      <Select v-if="state.tenants.length > 1" v-model="selectedTenantId" :options="tenantOptions" option-label="name" option-value="id" aria-label="เลือกร้านค้า" class="viewer-tenant-select" />
      <span v-else-if="selectedTenant" class="self-center text-sm font-medium"><i class="pi pi-building mr-2 text-primary" />{{ selectedTenant.name }}</span>
    </template>
    <template #sidebar-context>
      <div v-if="state.tenants.length > 1" class="grid gap-2"><label for="mobile-tenant" class="text-xs font-semibold">ร้านที่กำลังดู</label><Select input-id="mobile-tenant" v-model="selectedTenantId" :options="tenantOptions" option-label="name" option-value="id" aria-label="ร้านที่กำลังดู" fluid /></div>
      <div v-else-if="selectedTenant" class="font-semibold safe-wrap"><i class="pi pi-building mr-2 text-primary" />{{ selectedTenant.name }}</div>
    </template>
    <RouterView />
  </AppShell>
</template>

<style scoped>
.viewer-tenant-select { width: min(15rem, 30vw); }
@media (max-width: 575px) { .viewer-tenant-select { width: 8rem; } }
</style>
