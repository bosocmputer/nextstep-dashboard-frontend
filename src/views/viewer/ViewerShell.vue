<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import liff from '@line/liff';
import { ApiError, viewerApi } from '@/api';
import { useViewerSession } from '@/stores/viewer';
import { errorMessage } from '@/utils/format';

const route = useRoute(); const router = useRouter();
const { state, loadViewer, setViewer, setTenants, clearViewer } = useViewerSession();
const stage = ref<'loading' | 'ready' | 'error'>('loading'); const message = ref('');

async function initialize() {
  stage.value = 'loading'; message.value = '';
  try {
    try { await loadViewer(); stage.value = 'ready'; return; }
    catch (cause) { if (!(cause instanceof ApiError && cause.status === 401)) throw cause; }
    const liffId = import.meta.env.VITE_LINE_LIFF_ID;
    if (!liffId || liffId.startsWith('replace-')) throw new Error('ยังไม่ได้ตั้งค่า LINE LIFF ID สำหรับ environment นี้');
    await liff.init({ liffId });
    if (!liff.isLoggedIn()) { liff.login({ redirectUri: window.location.href }); return; }
    const idToken = liff.getIDToken();
    if (!idToken) throw new Error('LINE ไม่ส่ง ID token กรุณาเปิดผ่าน LINE อีกครั้ง');
    const invitationReference = route.path.endsWith('/invite') && typeof route.query.ref === 'string' ? route.query.ref : undefined;
    const deliveryReference = typeof route.query.deliveryRef === 'string' ? route.query.deliveryRef : undefined;
    const me = await viewerApi.exchange(idToken, invitationReference, deliveryReference);
    setViewer(me); setTenants((await viewerApi.tenants()).data);
    if (invitationReference || deliveryReference) await router.replace({ path: '/app' });
    stage.value = 'ready';
  } catch (cause) {
    stage.value = 'error';
    if (cause instanceof ApiError && cause.code === 'DELIVERY_REFERENCE_FORBIDDEN') message.value = 'ลิงก์รายงานนี้เป็นของ LINE บัญชีอื่น จึงไม่สามารถเปิดได้';
    else if (cause instanceof ApiError && cause.code === 'LINE_IDENTITY_FORBIDDEN') message.value = 'LINE บัญชีนี้ยังไม่ได้รับเชิญหรือถูกยกเลิกสิทธิ์';
    else message.value = errorMessage(cause);
  }
}

async function logout() {
  try { await viewerApi.logout(); } finally { clearViewer(); await router.replace('/app'); await initialize(); }
}
onMounted(initialize);
</script>

<template>
  <div class="viewer-app min-h-screen bg-surface-50 dark:bg-surface-950">
    <header class="sticky top-0 z-20 bg-surface-0/95 dark:bg-surface-900/95 backdrop-blur border-b border-surface">
      <div class="max-w-7xl mx-auto px-4 md:px-6 h-16 flex items-center justify-between gap-3"><RouterLink to="/app" class="flex items-center gap-3 no-underline text-color font-bold"><span class="grid place-items-center w-10 h-10 rounded-xl bg-primary text-primary-contrast"><i class="pi pi-chart-line" /></span><span>NEXTSTEP</span></RouterLink><div v-if="stage === 'ready'" class="flex items-center gap-2"><span class="hidden sm:inline text-sm text-muted-color">{{ state.me?.displayName }}</span><Button icon="pi pi-sign-out" text rounded aria-label="ออกจากระบบ" @click="logout" /></div></div>
    </header>
    <main class="max-w-7xl mx-auto px-4 md:px-6 py-6 md:py-8">
      <div v-if="stage === 'loading'" class="max-w-2xl mx-auto surface-card rounded-2xl p-6"><div class="flex items-center gap-4 mb-5"><ProgressSpinner style="width: 2rem; height: 2rem" stroke-width="6" /><div><h1 class="text-xl font-semibold m-0">กำลังยืนยัน LINE</h1><p class="text-muted-color mt-1 mb-0">ตรวจสอบตัวตนและสิทธิ์ล่าสุด</p></div></div><Skeleton height="10rem" /></div>
      <section v-else-if="stage === 'error'" class="max-w-xl mx-auto surface-card rounded-2xl p-7 text-center"><i class="pi pi-shield text-5xl text-red-500" /><h1 class="text-2xl font-bold mb-2">ไม่สามารถเปิด Dashboard</h1><p class="text-muted-color safe-wrap">{{ message }}</p><Button label="ลองใหม่" icon="pi pi-refresh" class="mt-4" @click="initialize" /></section>
      <RouterView v-else />
    </main>
  </div>
  <Toast />
</template>

<style scoped>.viewer-app { color: var(--text-color); }</style>
