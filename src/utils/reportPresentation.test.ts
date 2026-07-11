import { describe, expect, it } from 'vitest';
import { reportDefinitions } from '@/api';
import { reportPresentations, presentationFor, visibleReportColumns } from './reportPresentation';

describe('report presentation metadata', () => {
  it('defines a business-first presentation for all ten reports', () => {
    expect(Object.keys(reportPresentations).sort()).toEqual(reportDefinitions.map((item) => item.reportKey).sort());
    for (const definition of Object.values(reportPresentations)) {
      expect(definition.columns.filter((column) => column.defaultVisible).length).toBeGreaterThanOrEqual(3);
      expect(new Set(definition.columns.map((column) => column.key)).size).toBe(definition.columns.length);
      expect(definition.columns.filter((column) => column.technical && column.defaultVisible)).toEqual([]);
    }
  });

  it('shows configured business columns first and keeps unknown columns optional', () => {
    const available = ['last_status', 'doc_no', 'total_amount', 'future_provider_field', 'doc_date'];
    expect(visibleReportColumns('sales_goods_services', available).map((column) => column.key)).toEqual(['doc_date', 'doc_no', 'total_amount']);
    expect(presentationFor('sales_goods_services', available).find((column) => column.key === 'future_provider_field')).toEqual(expect.objectContaining({ technical: true, defaultVisible: false }));
  });
});
