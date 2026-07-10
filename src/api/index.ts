import { apiRequest, newIdempotencyKey, queryString } from './client';
import type {
  AdminSession, AuditPage, CreateReportRunInput, DataPage, DeliveryPage, Recipient, RecipientPage, ReportDefinition,
  FlexPreview, FlexPreviewInput, LineQuotaStatus, NotificationExecution, ReportKey, ReportRowPage, ReportRun, ReportRunPage, Schedule, ScheduleInput, SchedulePage, SchedulePatch,
  SMLConnectionInput, SMLConnectionStatus, SMLConnectionTestResult, Tenant, TenantInput, TenantPage, TenantPatch,
  ViewerMe, ViewerTenant
} from './types';

const api = '/api/v1';

export const adminApi = {
  login: (username: string, password: string) => apiRequest<AdminSession>(`${api}/auth/admin/login`, { method: 'POST', body: { username, password } }),
  session: () => apiRequest<AdminSession>(`${api}/auth/admin/session`),
  logout: () => apiRequest<void>(`${api}/auth/admin/logout`, { method: 'POST', scope: 'admin' }),
  rotatePassword: (currentPassword: string, newPassword: string) => apiRequest<AdminSession>(`${api}/auth/admin/password`, { method: 'PUT', scope: 'admin', body: { currentPassword, newPassword } }),
  listTenants: (filters: { cursor?: string; pageSize?: number; status?: string; search?: string } = {}) => apiRequest<TenantPage>(`${api}/admin/tenants${queryString(filters)}`),
  createTenant: (input: TenantInput) => apiRequest<Tenant>(`${api}/admin/tenants`, { method: 'POST', scope: 'admin', idempotencyKey: newIdempotencyKey('tenant'), body: input }),
  getTenant: (tenantId: string) => apiRequest<Tenant>(`${api}/admin/tenants/${tenantId}`),
  updateTenant: (tenantId: string, input: TenantPatch) => apiRequest<Tenant>(`${api}/admin/tenants/${tenantId}`, { method: 'PATCH', scope: 'admin', body: input }),
  getSML: (tenantId: string) => apiRequest<SMLConnectionStatus>(`${api}/admin/tenants/${tenantId}/sml-connection`),
  replaceSML: (tenantId: string, input: SMLConnectionInput) => apiRequest<SMLConnectionStatus>(`${api}/admin/tenants/${tenantId}/sml-connection`, { method: 'PUT', scope: 'admin', body: input }),
  testSML: (tenantId: string) => apiRequest<SMLConnectionTestResult>(`${api}/admin/tenants/${tenantId}/sml-connection/test`, { method: 'POST', scope: 'admin', timeoutMs: 35_000 }),
  listRecipients: (tenantId: string, cursor?: string) => apiRequest<RecipientPage>(`${api}/admin/tenants/${tenantId}/recipients${queryString({ cursor, pageSize: 100 })}`),
  inviteRecipient: (tenantId: string, invitationLabel: string) => apiRequest<Recipient>(`${api}/admin/tenants/${tenantId}/recipients`, { method: 'POST', scope: 'admin', idempotencyKey: newIdempotencyKey('recipient'), body: { invitationLabel } }),
  replacePermissions: (tenantId: string, recipientId: string, reportKeys: ReportKey[]) => apiRequest(`${api}/admin/tenants/${tenantId}/recipients/${recipientId}/permissions`, { method: 'PUT', scope: 'admin', body: { reportKeys } }),
  listSchedules: (tenantId: string, cursor?: string) => apiRequest<SchedulePage>(`${api}/admin/tenants/${tenantId}/schedules${queryString({ cursor, pageSize: 100 })}`),
  createSchedule: (tenantId: string, input: ScheduleInput) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules`, { method: 'POST', scope: 'admin', idempotencyKey: newIdempotencyKey('schedule'), body: input }),
  previewSchedule: (tenantId: string, input: FlexPreviewInput) => apiRequest<FlexPreview>(`${api}/admin/tenants/${tenantId}/schedules/preview`, { method: 'POST', scope: 'admin', body: input }),
  updateSchedule: (tenantId: string, scheduleId: string, input: SchedulePatch) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}`, { method: 'PATCH', scope: 'admin', body: input }),
  activateSchedule: (tenantId: string, scheduleId: string) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/activate`, { method: 'POST', scope: 'admin' }),
  pauseSchedule: (tenantId: string, scheduleId: string) => apiRequest<Schedule>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/pause`, { method: 'POST', scope: 'admin' }),
  testSendSchedule: (tenantId: string, scheduleId: string) => apiRequest<NotificationExecution>(`${api}/admin/tenants/${tenantId}/schedules/${scheduleId}/test-send`, { method: 'POST', scope: 'admin', idempotencyKey: newIdempotencyKey('schedule-test-send') }),
  lineQuota: () => apiRequest<LineQuotaStatus>(`${api}/admin/line-quota`),
  reportRuns: (filters: { cursor?: string; tenantId?: string; status?: string } = {}) => apiRequest<ReportRunPage>(`${api}/admin/report-runs${queryString({ ...filters, pageSize: 50 })}`),
  deliveries: (filters: { cursor?: string; tenantId?: string } = {}) => apiRequest<DeliveryPage>(`${api}/admin/line-deliveries${queryString({ ...filters, pageSize: 50 })}`),
  audit: (filters: { cursor?: string; tenantId?: string } = {}) => apiRequest<AuditPage>(`${api}/admin/audit-logs${queryString({ ...filters, pageSize: 50 })}`)
};

export const viewerApi = {
  exchange: (idToken: string, invitationReference?: string, deliveryReference?: string) => apiRequest<ViewerMe>(`${api}/viewer/line/session`, { method: 'POST', body: { idToken, invitationReference, deliveryReference }, timeoutMs: 15_000 }),
  me: () => apiRequest<ViewerMe>(`${api}/viewer/me`),
  logout: () => apiRequest<void>(`${api}/viewer/logout`, { method: 'POST', scope: 'viewer' }),
  tenants: () => apiRequest<DataPage<ViewerTenant>>(`${api}/viewer/tenants`),
  reports: (tenantId: string) => apiRequest<DataPage<ReportDefinition>>(`${api}/viewer/tenants/${tenantId}/reports`),
  createRun: (tenantId: string, reportKey: ReportKey, input: CreateReportRunInput) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs`, { method: 'POST', scope: 'viewer', idempotencyKey: newIdempotencyKey('viewer-run'), body: input }),
  run: (tenantId: string, reportKey: ReportKey, runId: string) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}`),
  rows: (tenantId: string, reportKey: ReportKey, runId: string, cursor?: string) => apiRequest<ReportRowPage>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}/rows${queryString({ cursor, pageSize: 100 })}`),
  cancelRun: (tenantId: string, reportKey: ReportKey, runId: string) => apiRequest<ReportRun>(`${api}/viewer/tenants/${tenantId}/reports/${reportKey}/runs/${runId}/cancel`, { method: 'POST', scope: 'viewer' })
};

export * from './types';
export { ApiError } from './client';
