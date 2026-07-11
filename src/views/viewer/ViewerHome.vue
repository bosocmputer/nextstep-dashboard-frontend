<script setup lang="ts">
import { watchEffect } from 'vue';
import { useRouter } from 'vue-router';
import { useViewerSession } from '@/stores/viewer';

const router = useRouter();
const { state } = useViewerSession();
watchEffect(() => {
  if (state.selectedTenantId) void router.replace(`/app/tenant/${state.selectedTenantId}`);
});
</script>

<template>
  <div class="card text-center"><i class="pi pi-lock text-4xl text-muted-color" /><h1 class="text-xl">ยังไม่มีร้านค้าที่เข้าถึงได้</h1><p class="text-muted-color mb-0">ติดต่อผู้ดูแลเพื่อเชื่อม LINE บัญชีนี้กับร้านค้า</p></div>
</template>
