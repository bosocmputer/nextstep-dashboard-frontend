import { describe, expect, it } from 'vitest';
import { normalizedAuditAction, toDateFilter } from './adminTableFilters';

describe('admin table filters', () => {
  it('serializes the selected local calendar date without a UTC shift', () => {
    expect(toDateFilter(new Date(2026, 6, 19, 23, 30))).toBe('2026-07-19');
  });

  it('normalizes an audit action into the backend-safe contract', () => {
    expect(normalizedAuditAction(' tenant updated ')).toBe('TENANT_UPDATED');
    expect(normalizedAuditAction('')).toBeUndefined();
  });
});
