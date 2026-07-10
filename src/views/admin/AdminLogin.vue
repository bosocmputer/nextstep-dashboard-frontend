<script setup lang="ts">
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAdminSession } from '@/stores/session';
import { errorMessage } from '@/utils/format';
import { hasAdminLoginInput } from '@/utils/passwordPolicy';

const route = useRoute();
const router = useRouter();
const { login } = useAdminSession();
const username = ref('superadmin');
const password = ref('');
const loading = ref(false);
const error = ref(route.query.sessionError === '1' ? 'ไม่สามารถตรวจสอบ Session ได้ กรุณาเข้าสู่ระบบใหม่' : '');

async function submit() {
  error.value = '';
  if (!hasAdminLoginInput(username.value, password.value)) {
    error.value = 'กรุณากรอก username และรหัสผ่าน';
    return;
  }
  loading.value = true;
  try {
    const session = await login(username.value.trim(), password.value);
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/admin') ? route.query.redirect : '/admin';
    await router.replace(session.mustRotateBootstrapPassword ? '/admin/password' : redirect);
  } catch (cause) {
    error.value = errorMessage(cause);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <main class="min-h-screen grid place-items-center px-4 py-10 bg-surface-50 dark:bg-surface-950">
    <section class="login-card w-full max-w-md surface-card p-7 md:p-9">
      <div class="flex items-center gap-3 mb-7">
        <div class="login-mark grid place-items-center w-12 h-12 bg-primary text-primary-contrast"><i class="pi pi-chart-line text-xl" /></div>
        <div class="min-w-0"><h1 class="login-title m-0 font-bold">Nextstep Admin</h1><p class="m-0 mt-1 text-muted-color">เข้าสู่ระบบผู้ดูแลส่วนกลาง</p></div>
      </div>
      <Message v-if="error" severity="error" :closable="false" class="mb-5">{{ error }}</Message>
      <form class="grid gap-5" @submit.prevent="submit">
        <div class="grid gap-2"><label for="username" class="font-medium">Username</label><InputText id="username" v-model="username" autocomplete="username" fluid /></div>
        <div class="grid gap-2"><label for="password" class="font-medium">รหัสผ่าน</label><Password input-id="password" v-model="password" :feedback="false" toggle-mask autocomplete="current-password" fluid /></div>
        <Button type="submit" label="เข้าสู่ระบบ" icon="pi pi-sign-in" :loading="loading" fluid />
      </form>
      <p class="text-xs text-muted-color text-center mt-6 mb-0">ระบบจะล็อกชั่วคราวเมื่อกรอกรหัสผ่านผิดหลายครั้ง</p>
    </section>
  </main>
</template>

<style scoped>
.login-card { border-radius: var(--content-border-radius); }
.login-mark { flex: 0 0 3rem; border-radius: var(--content-border-radius); }
.login-title { font-size: 1.5rem; white-space: nowrap; }
</style>
