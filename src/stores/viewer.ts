import { reactive, readonly } from 'vue';
import { viewerApi, type ReportDefinition, type ViewerMe, type ViewerTenant } from '@/api';

type ViewerState = {
  me: ViewerMe | null;
  tenants: ViewerTenant[];
  selectedTenantId: string;
  reportsByTenant: Record<string, ReportDefinition[]>;
  ready: boolean;
};

const state = reactive<ViewerState>({ me: null, tenants: [], selectedTenantId: '', reportsByTenant: {}, ready: false });

async function loadViewer(): Promise<void> {
  state.me = await viewerApi.me();
  state.tenants = (await viewerApi.tenants()).data;
  if (!state.tenants.some((tenant) => tenant.id === state.selectedTenantId)) state.selectedTenantId = state.tenants[0]?.id ?? '';
  state.ready = true;
}

function setViewer(me: ViewerMe): void { state.me = me; state.ready = true; }
function setTenants(tenants: ViewerTenant[]): void {
  state.tenants = tenants;
  if (!tenants.some((tenant) => tenant.id === state.selectedTenantId)) state.selectedTenantId = tenants[0]?.id ?? '';
}
function selectTenant(tenantId: string): void {
  if (state.tenants.some((tenant) => tenant.id === tenantId)) state.selectedTenantId = tenantId;
}
function setReports(tenantId: string, reports: ReportDefinition[]): void { state.reportsByTenant[tenantId] = reports; }
async function ensureReports(tenantId: string, force = false): Promise<ReportDefinition[]> {
  if (!force && state.reportsByTenant[tenantId]) return state.reportsByTenant[tenantId];
  const reports = (await viewerApi.reports(tenantId)).data;
  setReports(tenantId, reports);
  return reports;
}
function clearViewer(): void {
  state.me = null;
  state.tenants = [];
  state.selectedTenantId = '';
  state.reportsByTenant = {};
  state.ready = false;
}

export function useViewerSession() {
  return { state: readonly(state), loadViewer, setViewer, setTenants, selectTenant, setReports, ensureReports, clearViewer };
}
