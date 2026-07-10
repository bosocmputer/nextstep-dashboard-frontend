import { describe, expect, it } from 'vitest';
import { statusLabel } from './status';

describe('statusLabel', () => {
  it('translates operational states without obscuring unknown codes', () => {
    expect(statusLabel('SUCCEEDED')).toBe('สำเร็จ');
    expect(statusLabel('FAILED_PERMANENT')).toBe('ส่งไม่สำเร็จ');
    expect(statusLabel('FUTURE_STATE')).toBe('FUTURE_STATE');
    expect(statusLabel()).toBe('—');
  });
});
