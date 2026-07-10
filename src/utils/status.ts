const labels: Record<string, string> = {
  QUEUED: 'รอคิว', CLAIMED: 'กำลังเตรียม', RUNNING: 'กำลังทำงาน', SUCCEEDED: 'สำเร็จ', FAILED: 'ไม่สำเร็จ', CANCELLED: 'ยกเลิกแล้ว', EXPIRED: 'หมดอายุ',
  PENDING: 'รอดำเนินการ', SENDING: 'กำลังส่ง', ACCEPTED: 'LINE รับแล้ว', RETRY_WAIT: 'รอส่งซ้ำ', UNCERTAIN: 'รอตรวจสอบ', FAILED_PERMANENT: 'ส่งไม่สำเร็จ',
  ACTIVE: 'ใช้งาน', DISABLED: 'ปิดใช้งาน', PAUSED: 'พักไว้', DRAFT: 'ฉบับร่าง', REVOKED: 'ยกเลิกสิทธิ์',
  READY: 'พร้อม', UNTESTED: 'ยังไม่ได้ทดสอบ', UNCONFIGURED: 'ยังไม่ได้ตั้งค่า',
  SUCCESS: 'สำเร็จ', DENIED: 'ถูกปฏิเสธ',
  ADMIN: 'ผู้ดูแล', VIEWER: 'ผู้ดูรายงาน', WORKER: 'ระบบประมวลผล', SYSTEM: 'ระบบ'
};

export function statusLabel(value?: string | null): string {
  if (!value) return '—';
  return labels[value] ?? value;
}
