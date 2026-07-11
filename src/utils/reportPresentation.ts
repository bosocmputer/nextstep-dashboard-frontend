import type { ReportKey } from '@/api';
import { metricLabel } from './format';

export interface ReportColumnDefinition {
  key: string;
  label: string;
  defaultVisible: boolean;
  mobilePriority: number;
  technical?: boolean;
  frozen?: boolean;
}

export interface ReportPresentationDefinition {
  reportKey: ReportKey;
  columns: ReportColumnDefinition[];
}

const business = (key: string, label = metricLabel(key), mobilePriority = 3, frozen = false): ReportColumnDefinition => ({ key, label, defaultVisible: true, mobilePriority, frozen });
const optional = (key: string, label = metricLabel(key), technical = false): ReportColumnDefinition => ({ key, label, defaultVisible: false, mobilePriority: 0, technical });

export const reportPresentations: Record<ReportKey, ReportPresentationDefinition> = {
  sales_goods_services: { reportKey: 'sales_goods_services', columns: [business('doc_date', 'วันที่', 5, true), business('doc_no', 'เลขที่เอกสาร', 5, true), business('cust_name', 'ลูกค้า', 4), business('item_name', 'สินค้า', 4), business('qty', 'จำนวน', 3), business('sum_amount', 'มูลค่ารายการ', 5), business('total_amount', 'ยอดขาย', 5), optional('cust_code'), optional('item_code'), optional('branch_code'), optional('wh_code'), optional('shelf_code'), optional('unit_code'), optional('price'), optional('discount'), optional('vat_type', 'ประเภทภาษี', true), optional('tax_type', 'รหัสภาษี', true), optional('last_status', 'สถานะภายใน', true), optional('ref_row', 'แถวอ้างอิง', true), optional('line_number', 'ลำดับรายการ', true)] },
  purchase_goods_payables: { reportKey: 'purchase_goods_payables', columns: [business('doc_date', 'วันที่', 5, true), business('doc_no', 'เลขที่เอกสาร', 5, true), business('cust_name', 'ผู้จำหน่าย', 4), business('item_name', 'สินค้า', 4), business('qty', 'จำนวน', 3), business('sum_amount', 'มูลค่ารายการ', 5), business('total_amount', 'ยอดซื้อ', 5), optional('cust_code'), optional('item_code'), optional('branch_code'), optional('wh_code'), optional('shelf_code'), optional('unit_code'), optional('price'), optional('discount'), optional('vat_type', 'ประเภทภาษี', true), optional('tax_type', 'รหัสภาษี', true), optional('last_status', 'สถานะภายใน', true), optional('ref_row', 'แถวอ้างอิง', true), optional('line_number', 'ลำดับรายการ', true)] },
  gross_profit_by_product: { reportKey: 'gross_profit_by_product', columns: [business('code', 'รหัสสินค้า', 4, true), business('name_1', 'ชื่อสินค้า', 5, true), business('unit_name', 'หน่วย', 2), business('qty_sale', 'จำนวนขาย', 3), business('amount_sale', 'ยอดขาย', 5), business('cost_sale', 'ต้นทุนขาย', 4), optional('qty_sale_return', 'จำนวนคืน'), optional('amount_sale_return', 'ยอดคืน'), optional('cost_sale_return', 'ต้นทุนคืน')] },
  gross_profit_by_ar_customer: { reportKey: 'gross_profit_by_ar_customer', columns: [business('ar_code', 'รหัสลูกหนี้', 4, true), business('ar_detail', 'ชื่อลูกหนี้', 5, true), business('qty_sale', 'จำนวนขาย', 3), business('amount_sale', 'ยอดขาย', 5), business('cost_sale', 'ต้นทุนขาย', 4), optional('qty_sale_return', 'จำนวนคืน'), optional('amount_sale_return', 'ยอดคืน'), optional('cost_sale_return', 'ต้นทุนคืน')] },
  stock_balance: { reportKey: 'stock_balance', columns: [business('ic_code', 'รหัสสินค้า', 4, true), business('ic_name', 'ชื่อสินค้า', 5, true), business('ic_unit_code', 'หน่วย', 2), business('balance_qty', 'คงเหลือ', 5), business('balance_amount', 'มูลค่าคงเหลือ', 5), business('average_cost_end', 'ต้นทุนล่าสุด', 3), optional('average_cost', 'ต้นทุนเฉลี่ย'), optional('qty_in', 'รับเข้า'), optional('amount_in', 'มูลค่ารับเข้า'), optional('qty_out', 'จ่ายออก'), optional('amount_out', 'มูลค่าจ่ายออก'), optional('average_cost_in', 'ต้นทุนรับเข้า'), optional('average_cost_out', 'ต้นทุนจ่ายออก')] },
  stock_reorder: { reportKey: 'stock_reorder', columns: [business('ic_code', 'รหัสสินค้า', 4, true), business('ic_name', 'ชื่อสินค้า', 5, true), business('ic_unit_code', 'หน่วย', 2), business('balance_qty', 'คงเหลือ', 5), business('purchase_point', 'จุดสั่งซื้อ', 4), business('purchase_balance_qty', 'สินค้ารอรับ', 3)] },
  ar_customer_movement: { reportKey: 'ar_customer_movement', columns: [business('cust_name', 'ลูกหนี้', 5, true), business('doc_date', 'วันที่', 4), business('doc_no', 'เลขที่เอกสาร', 5), business('amount', 'ยอดเคลื่อนไหว', 5), business('credit_day', 'เครดิต (วัน)', 2), optional('cust_code', 'รหัสลูกหนี้'), optional('tax_doc_no', 'เลขที่ใบกำกับ'), optional('doc_ref', 'เอกสารอ้างอิง'), optional('doc_type', 'ประเภทรายการ', true), optional('doc_sort', 'ลำดับภายใน', true), optional('roworder', 'แถวภายใน', true)] },
  ar_debt_receipt: { reportKey: 'ar_debt_receipt', columns: [business('doc_date', 'วันที่', 5, true), business('doc_no', 'เลขที่รับชำระ', 5, true), business('cust_name', 'ลูกค้า', 4), business('total_net_value', 'ยอดรับชำระ', 5), business('cash_amount', 'เงินสด', 3), business('transfer_amount', 'เงินโอน', 3), optional('cust_code', 'รหัสลูกค้า'), optional('billing_date', 'วันที่วางบิล'), optional('payment_split_missing', 'ข้อมูลการแบ่งชำระไม่ครบ', true)] },
  cash_bank_receipts: { reportKey: 'cash_bank_receipts', columns: [business('doc_date', 'วันที่', 5, true), business('doc_no', 'เลขที่เอกสาร', 5, true), business('ap_ar_name', 'ผู้ชำระ/รายละเอียด', 4), business('total_amount', 'ยอดรับเงิน', 5), business('cash_amount', 'เงินสด', 3), business('transfer_amount', 'เงินโอน', 3), optional('card_amount', 'บัตร'), optional('chq_amount', 'เช็ค'), optional('coupon_amount', 'คูปอง'), optional('doc_time', 'เวลา'), optional('ap_ar_code', 'รหัสลูกค้า'), optional('trans_flag_code', 'รหัสประเภทรายการ', true), optional('trans_flag_label', 'ประเภทรายการ')] },
  cash_bank_payments: { reportKey: 'cash_bank_payments', columns: [business('doc_date', 'วันที่', 5, true), business('doc_no', 'เลขที่เอกสาร', 5, true), business('ap_ar_name', 'ผู้รับ/รายละเอียด', 4), business('total_amount', 'ยอดจ่ายเงิน', 5), business('cash_amount', 'เงินสด', 3), business('transfer_amount', 'เงินโอน', 3), optional('card_amount', 'บัตร'), optional('chq_amount', 'เช็ค'), optional('petty_cash_amount', 'เงินสดย่อย'), optional('doc_time', 'เวลา'), optional('ap_ar_code', 'รหัสผู้จำหน่าย'), optional('trans_flag_code', 'รหัสประเภทรายการ', true), optional('trans_flag_label', 'ประเภทรายการ')]
  }
};

export function presentationFor(reportKey: ReportKey, availableColumns: string[]): ReportColumnDefinition[] {
  const configured = new Map(reportPresentations[reportKey].columns.map((column) => [column.key, column]));
  return availableColumns.map((key) => configured.get(key) ?? optional(key, metricLabel(key), true));
}

export function visibleReportColumns(reportKey: ReportKey, availableColumns: string[], selectedKeys?: string[]): ReportColumnDefinition[] {
  const selected = selectedKeys ? new Set(selectedKeys) : undefined;
  const available = new Set(availableColumns);
  const configuredOrder = reportPresentations[reportKey].columns.filter((column) => available.has(column.key));
  const unknown = presentationFor(reportKey, availableColumns).filter((column) => !reportPresentations[reportKey].columns.some((item) => item.key === column.key));
  return [...configuredOrder, ...unknown].filter((column) => selected ? selected.has(column.key) : column.defaultVisible);
}
