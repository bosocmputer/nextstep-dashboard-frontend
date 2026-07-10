import { reactive, readonly } from 'vue';
import { viewerApi, type ViewerMe, type ViewerTenant } from '@/api';

const state = reactive<{ me: ViewerMe | null; tenants: ViewerTenant[]; ready: boolean }>({ me: null, tenants: [], ready: false });

async function loadViewer(): Promise<void> {
  state.me = await viewerApi.me();
  state.tenants = (await viewerApi.tenants()).data;
  state.ready = true;
}

function setViewer(me: ViewerMe): void { state.me = me; state.ready = true; }
function setTenants(tenants: ViewerTenant[]): void { state.tenants = tenants; }
function clearViewer(): void { state.me = null; state.tenants = []; state.ready = false; }

export function useViewerSession() { return { state: readonly(state), loadViewer, setViewer, setTenants, clearViewer }; }
