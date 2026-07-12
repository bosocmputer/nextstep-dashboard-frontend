import { apiRequest, newIdempotencyKey, queryString } from './client';
import type {
  AdminReportCatalog, AdminSession, AuditPage, CreateReportRunInput, DataPage, DeliveryPage, Recipient, RecipientPage, ReportDefinition,
  FlexPreview, FlexPreviewInput, LineQuotaStatus, NotificationExecution, ReportKey, ReportRowPage, ReportRun, ReportRunPage, Schedule, ScheduleInput, SchedulePage, SchedulePatch,
  SMLConnectionInput, SMLConnectionStatus, SMLConnectionTestResult, Tenant, TenantInput, TenantPage, TenantPatch,
  DashboardRefresh, DashboardRefreshInput, DashboardRefreshResult, ExecutiveOverview, ReportDashboard, ViewerMe, ViewerTenant,
  DashboardRefreshPolicy, DashboardRefreshPolicyInput, ReportRevalidation, OverviewRevalidation, DashboardSnapshot
} from './types';

const api = '/api/v1';

export const adminApi = {
  login: (username: string, password: string) => apiRequest<AdminSession>(`${api}/auth/admin/login`, { method: 'POST', body: { username, password } }),
  session: () => apiRequest<AdminSession>(`${api}/auth/admin/session`),
  logout: () => apiRequest<void>(`${api}/auth/admin/logout`, { method: 'POST', scope: 'admin' }),
  rotatePassword: (currentPassword: string, newPassword: string) => apiRequest<AdminSession>(`${api}/auth/admin/password`, { method: 'PUT', scope: 'admin', body: { currentPassword, newPassword } }),
  reports: (signal?: AbortSignal) => apiRequest<AdminReportCatalog>(`${api}/admin/reports`, { signal }),
  listTenants: (filters: { cursor?: string; pageSize?: number; status?: string; search?: string } = {}, signal?: AbortSignal) => apiRequest<TenantPage>(`${api}/admin/tenants${queryString(filters)}`, { signal }),
  createTenant: (input: TenantInput, idempotencyKey = newIdempotencyKey('tenant')) => apiRequest<Tenant>(`${api}/admin/tenants`, { method: 'POST', scope: 'admin', idempotencyKey, body: input }),
  getTenant: (tenantId: string) => apiRequest<Tenant>(`${api}/admin/tenants/${tenantId}`),
  updateTenant: (tenantId: string, input: TenantPatch) => apiRequest<Tenant>(`${api}/admin/tenants/${tenantId}`, { method: 'PATCH', scope: 'admin', body: input }),
  getDashboardRefreshPolicy: (tenantId: string, signal?: AbortSignal) => apiRequest<DashboardRefreshPolicy>(`${api}/admin/tenants/${tenantId}/dashboard-refresh-policy`, { signal }),
  updateDashboardRefreshPolicy: (tenantId: string, input: DashboardRefreshPolicyInput) => apiRequest<DashboardRefreshPolicy>(`${api}/admin/tenants/${tenantId}/dashboard-refresh-policy`, { method: 'PUT', scope: 'admin', body: input }),
  getSML: (tenantId: string) => apiRequest<SMLConnectionStatus>(`${api}/admin/tenants/${tenantId}/sml-connection`),
  replaceSML: (tenantId: string, input: SMLConnectionInput) => apiRequest<SMLConnectionStatus>(`${api}/admin/tenants/${tenantId}/sml-connection`, { method: 'PUT', scope: 'admin', body: input }),
  testSML: (tenantId: string) => apiRequest<SMLConnectionTestResult>(`${api}/admin/tenants/${tenantId}/sml-connection/test`, { method: 'POST', scope: 'admin', timeoutMs: 35_000 }),
  listRecipients: (tenantId: string, cursor?: string) => apiRequest<RecipientPage>(`${api}/admin/tenants/${tenantId}/recipients${queryString({ cursor, pageSize: 100 })}`),
  getRecipient: (tenantId: string, recipientId: string, signal?: AbortSignal) => apiRequest<Recipient>(`${api}/admin/tenants/${tenantId}/recipients/${recipientId}`, { signal }),
  inviteRecipient: (tenantId: string, invitationLabel: string, idempotencyKey = newIdempotencyKey('recipient')) => apiRequest<Recipient>(`${api}/admin/tenants/${tenantId}/recipients`, { method: 'POST', scope: 'admin', idempotencyKey, body: { invitationLabel } }),
  replacePermissions: (tenantId: string, recipientId: string, reportKeys: ReportKey[], version: number) => apiRequest<Recipient>(`${api}/admin/tenants/${tenantId}/recipients/${recipientId}/permissions`, { method: 'PUT', scope: 'admin', body: { reportKeys, version } }),
  listSchedules: (tenantId: string, cursor?: string, includeArchived = false) => apiRequest<SchedulePage>(`${api}/admin/tenants/${tenantId}/schedules${queryString({ cursor, pageSize: 100, includeArchived: includeArchived ? 'true' : 'false' })}`),
  getSchedule: (tenantId: string, scheduleId: string, signal?: AbortSignal) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}`, { signal }),
  createSchedule: (tenantId: string, input: ScheduleInput, idempotencyKey = newIdempotencyKey('schedule')) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules`, { method: 'POST', scope: 'admin', idempotencyKey, body: input }),
  previewSchedule: (tenantId: string, input: FlexPreviewInput) => apiRequest<FlexPreview>(`${api}/admin/tenants/${tenantId}/schedules/preview`, { method: 'POST', scope: 'admin', body: input }),
  updateSchedule: (tenantId: string, scheduleId: string, input: SchedulePatch) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}`, { method: 'PATCH', scope: 'admin', body: input }),
  activateSchedule: (tenantId: string, scheduleId: string) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/activate`, { method: 'POST', scope: 'admin' }),
  pauseSchedule: (tenantId: string, scheduleId: string) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/pause`, { method: 'POST', scope: 'admin' }),
  archiveSchedule: (tenantId: string, scheduleId: string, version: number) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}${queryString({ version })}`, { method: 'DELETE', scope: 'admin' }),
  restoreSchedule: (tenantId: string, scheduleId: string, version: number) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/restore${queryString({ version })}`, { method: 'POST', scope: 'admin' }),
  testSendSchedule: (tenantId: string, scheduleId: string, idempotencyKey = newIdempotencyKey('schedule-test-send')) => apiRequest<NotificationExecution>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/test-send`, { method: 'POST', scope: 'admin', idempotencyKey }),
  lineQuota: () => apiRequest<LineQuotaStatus>(`${api}/admin/line-quota`),
  reportRuns: (filters: { cursor?: string; tenantId?: string; status?: string } = {}, signal?: AbortSignal) => apiRequest<ReportRunPage>(`${api}/admin/report-runs${queryString({ ...filters, pageSize: 50 })}`, { signal }),
  deliveries: (filters: { cursor?: string; tenantId?: string } = {}, signal?: AbortSignal) => apiRequest<DeliveryPage>(`${api}/admin/line-deliveries${queryString({ ...filters, pageSize: 50 })}`, { signal }),
  audit: (filters: { cursor?: string; tenantId?: string } = {}, signal?: AbortSignal) => apiRequest<AuditPage>(`${api}/admin/audit-logs${queryString({ ...filters, pageSize: 50 })}`, { signal })
};

export const viewerApi = {
  exchange: (idToken: string, invitationReference?: string, deliveryReference?: string) => apiRequest<ViewerMe>(`${api}/viewer/line/session`, { method: 'POST', body: { idToken, invitationReference, deliveryReference }, timeoutMs: 15_000 }),
  me: () => apiRequest<ViewerMe>(`${api}/viewer/me`),
  logout: () => apiRequest<void>(`${api}/viewer/logout`, { method: 'POST', scope: 'viewer' }),
  tenants: () => apiRequest<DataPage<ViewerTenant>>(`${api}/viewer/tenants`),
  reports: (tenantId: string, signal?: AbortSignal) => apiRequest<DataPage<ReportDefinition>>(`${api}/viewer/tenants/${tenantId}/reports`, { signal }),
  overview: (tenantId: string, signal?: AbortSignal) => apiRequest<ExecutiveOverview>(`${api}/viewer/tenants/${tenantId}/executive-overview`, { signal }),
  exactOverview: (tenantId: string, input: DashboardRefreshInput, signal?: AbortSignal) => apiRequest<ExecutiveOverview>(`${api}/viewer/tenants/${tenantId}/executive-overview${overviewQueryString(input)}`, { signal }),
  createDashboardRefresh: (tenantId: string, input?: DashboardRefreshInput, idempotencyKey = newIdempotencyKey('dashboard-refresh')) => apiRequest<DashboardRefresh>(`${api}/viewer/tenants/${tenantId}/executive-overview/refreshes`, { method: 'POST', scope: 'viewer', idempotencyKey, body: input }),
  dashboardRefresh: (tenantId: string, refreshId: string, signal?: AbortSignal) => apiRequest<DashboardRefresh>(`${api}/viewer/tenants/${tenantId}/executive-overview/refreshes/${refreshId}`, { signal }),
  dashboardRefreshResult: (tenantId: string, refreshId: string, signal?: AbortSignal) => apiRequest<DashboardRefreshResult>(`${api}/viewer/tenants/${tenantId}/executive-overview/refreshes/${refreshId}/result`, { signal }),
  revalidateOverview: (tenantId: string, input: DashboardRefreshInput, signal?: AbortSignal) => apiRequest<OverviewRevalidation>(`${api}/viewer/tenants/${tenantId}/executive-overview/revalidations`, { method: 'POST', scope: 'viewer', body: input, signal }),
  exactSnapshot: (tenantId: string, reportKey: ReportKey, input: CreateReportRunInput, signal?: AbortSignal) => apiRequest<DashboardSnapshot>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/snapshots/latest${queryString(input)}`, { signal }),
  revalidateReport: (tenantId: string, reportKey: ReportKey, input: CreateReportRunInput, signal?: AbortSignal) => apiRequest<ReportRevalidation>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/revalidations`, { method: 'POST', scope: 'viewer', body: input, signal }),
  createRun: (tenantId: string, reportKey: ReportKey, input: CreateReportRunInput, idempotencyKey = newIdempotencyKey('viewer-run')) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs`, { method: 'POST', scope: 'viewer', idempotencyKey, body: input }),
  run: (tenantId: string, reportKey: ReportKey, runId: string, signal?: AbortSignal) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}`, { signal }),
  dashboard: (tenantId: string, reportKey: ReportKey, runId: string, signal?: AbortSignal) => apiRequest<ReportDashboard>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}/dashboard`, { signal }),
  rows: (tenantId: string, reportKey: ReportKey, runId: string, cursor?: string, pageSize = 25, signal?: AbortSignal) => apiRequest<ReportRowPage>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}/rows${queryString({ cursor, pageSize })}`, { signal }),
  cancelRun: (tenantId: string, reportKey: ReportKey, runId: string) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}/cancel`, { method: 'POST', scope: 'viewer' })
};

export * from './types';
export { ApiError } from './client';

function overviewQueryString(input?: DashboardRefreshInput): string {
  if (!input) return '';
  const query = new URLSearchParams({ periodPreset: input.periodPreset });
  if (input.dateFrom) query.set('dateFrom', input.dateFrom);
  if (input.dateTo) query.set('dateTo', input.dateTo);
  input.reportKeys.forEach((reportKey) => query.append('reportKey', reportKey));
  return `?${query.toString()}`;
}
