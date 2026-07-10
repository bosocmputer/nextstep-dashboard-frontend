export function formatDateTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' }).format(date);
}

export function formatDate(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(date);
}

export function formatMetric(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  const text = String(value);
  const number = Number(text.replaceAll(',', ''));
  if (Number.isFinite(number)) return new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 }).format(number);
  return text;
}

export function formatDateOnly(value: Date): string {
  if (Number.isNaN(value.getTime())) return '';
  const year = String(value.getFullYear()).padStart(4, '0');
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const metricLabels: Record<string, string> = {
  document_count: 'จำนวนเอกสาร',
  total_amount: 'ยอดรวม',
  gross_profit_amount: 'กำไรขั้นต้น',
  gross_margin_percent: 'อัตรากำไร (%)',
  item_count: 'จำนวนสินค้า',
  balance_amount: 'มูลค่าคงเหลือ',
  reorder_item_count: 'สินค้าถึงจุดสั่งซื้อ',
  shortage_qty: 'จำนวนขาด',
  customer_count: 'จำนวนลูกหนี้',
  net_movement_amount: 'ยอดเคลื่อนไหวสุทธิ',
  receipt_count: 'จำนวนเอกสารรับชำระ',
  total_received_amount: 'ยอดรับชำระ'
};

export function metricLabel(key: string): string {
  return metricLabels[key] ?? key.replaceAll('_', ' ');
}

export function errorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}
