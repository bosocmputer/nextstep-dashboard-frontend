import type { components } from './schema';

export type ProblemEnvelope = components['schemas']['ProblemEnvelope'];
export type AdminSession = components['schemas']['AdminSession'];
export type Tenant = components['schemas']['Tenant'];
export type TenantInput = components['schemas']['TenantInput'];
export type TenantPatch = components['schemas']['TenantPatch'];
export type TenantPage = components['schemas']['TenantPage'];
export type SMLConnectionInput = components['schemas']['SMLConnectionInput'];
export type SMLConnectionStatus = components['schemas']['SMLConnectionStatus'];
export type SMLConnectionTestResult = components['schemas']['SMLConnectionTestResult'];
export type Recipient = components['schemas']['Recipient'];
export type RecipientPage = components['schemas']['RecipientPage'];
export type ReportKey = components['schemas']['ReportKey'];
export type ReportDefinition = components['schemas']['ReportDefinition'];
export type ScheduleInput = components['schemas']['ScheduleInput'];
export type SchedulePatch = components['schemas']['SchedulePatch'];
export type Schedule = components['schemas']['Schedule'];
export type SchedulePage = components['schemas']['SchedulePage'];
export type FlexPreviewInput = components['schemas']['FlexPreviewInput'];
export type FlexPreview = components['schemas']['FlexPreview'];
export type NotificationExecution = components['schemas']['NotificationExecution'];
export type ReportRun = components['schemas']['ReportRun'];
export type ReportRunPage = components['schemas']['ReportRunPage'];
export type ReportRowPage = components['schemas']['ReportRowPage'];
export type ViewerMe = components['schemas']['ViewerMe'];
export type ViewerTenant = components['schemas']['ViewerTenant'];
export type DeliveryPage = components['schemas']['DeliveryPage'];
export type AuditPage = components['schemas']['AuditPage'];
export type CreateReportRunInput = components['schemas']['CreateReportRunInput'];

export interface DataPage<T> {
  data: T[];
  page: components['schemas']['PageInfo'];
}

export const reportDefinitions: ReportDefinition[] = [
  { reportKey: 'sales_goods_services', version: '1.0.0', label: 'รายงานขายสินค้าและบริการ', category: 'SALES', isSensitive: false },
  { reportKey: 'purchase_goods_payables', version: '1.0.0', label: 'รายงานซื้อสินค้าและตั้งหนี้', category: 'PURCHASE', isSensitive: true },
  { reportKey: 'gross_profit_by_product', version: '1.0.0', label: 'กำไรขั้นต้นตามสินค้า', category: 'GROSS_PROFIT', isSensitive: true },
  { reportKey: 'gross_profit_by_ar_customer', version: '1.0.0', label: 'กำไรขั้นต้นตามลูกหนี้', category: 'GROSS_PROFIT', isSensitive: true },
  { reportKey: 'stock_balance', version: '1.0.0', label: 'รายงานสต็อกคงเหลือ', category: 'INVENTORY', isSensitive: true },
  { reportKey: 'stock_reorder', version: '1.0.0', label: 'รายงานสินค้าถึงจุดสั่งซื้อ', category: 'INVENTORY', isSensitive: false },
  { reportKey: 'ar_customer_movement', version: '1.0.0', label: 'รายงานความเคลื่อนไหวลูกหนี้', category: 'AR', isSensitive: true },
  { reportKey: 'ar_debt_receipt', version: '1.0.0', label: 'รายงานรับชำระหนี้', category: 'AR', isSensitive: true },
  { reportKey: 'cash_bank_receipts', version: '1.0.0', label: 'รายงานรับเงิน', category: 'CASH_BANK', isSensitive: true },
  { reportKey: 'cash_bank_payments', version: '1.0.0', label: 'รายงานจ่ายเงิน', category: 'CASH_BANK', isSensitive: true }
];

export const reportDefinitionByKey = new Map(reportDefinitions.map((item) => [item.reportKey, item]));
