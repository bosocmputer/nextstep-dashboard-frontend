import { describe, expect, it } from 'vitest';
import { errorMessage, formatDateOnly, formatMetric, formatTime, metricLabel } from './format';

describe('format utilities', () => {
  it('preserves the local calendar date instead of converting through UTC', () => {
    const selected = new Date(2026, 6, 10, 0, 0, 0);
    expect(formatDateOnly(selected)).toBe('2026-07-10');
  });

  it('formats numeric metrics and safe empty values', () => {
    expect(formatMetric('1234.50')).toContain('1,234.5');
    expect(formatMetric(null)).toBe('—');
  });

  it('uses Thai KPI labels with a readable fallback', () => {
    expect(metricLabel('gross_profit_amount')).toBe('กำไรขั้นต้น');
    expect(metricLabel('doc_no')).toBe('เลขที่เอกสาร');
    expect(metricLabel('custom_metric')).toBe('custom metric');
  });

  it('turns known API error codes into actionable Thai messages', () => {
    expect(errorMessage({ code: 'REPORT_CONCURRENCY_LIMIT', message: 'English provider text' })).toContain('กำลังสร้างรายงาน');
    expect(errorMessage({ code: 'FUTURE_ERROR', message: 'ข้อความสำรอง' })).toBe('ข้อความสำรอง');
  });
});

describe('formatTime', () => {
  it('formats UTC timestamps as Thailand time', () => {
    expect(formatTime('2026-07-12T13:24:00Z')).toBe('20:24');
  });

  it('returns a safe placeholder for invalid values', () => {
    expect(formatTime('not-a-date')).toBe('—');
    expect(formatTime()).toBe('—');
  });
});
