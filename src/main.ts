import { createApp } from 'vue';
import Aura from '@primeuix/themes/aura';
import PrimeVue from 'primevue/config';
import ConfirmationService from 'primevue/confirmationservice';
import ToastService from 'primevue/toastservice';

import App from './App.vue';
import router from './router';
import '@/assets/tailwind.css';
import '@/assets/styles.scss';

const app = createApp(App);

app.use(router);
app.use(PrimeVue, {
  ripple: true,
  theme: {
    preset: Aura,
    options: { darkModeSelector: '.app-dark', cssLayer: false }
  }
});
app.use(ToastService);
app.use(ConfirmationService);
app.mount('#app');
