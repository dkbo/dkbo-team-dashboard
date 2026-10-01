import { describe, expect, expectTypeOf, it } from 'vitest';
import { PANE_STATUSES, toPaneStatus, type PaneStatus } from './types.ts';

describe('PANE_STATUSES', () => {
  it('是 PaneStatus 的單一來源', () => {
    expect(PANE_STATUSES).toEqual(['idle', 'working', 'blocked', 'done', 'unknown']);
    expectTypeOf<(typeof PANE_STATUSES)[number]>().toEqualTypeOf<PaneStatus>();
    expectTypeOf<PaneStatus>().toEqualTypeOf<'idle' | 'working' | 'blocked' | 'done' | 'unknown'>();
  });
});

describe('toPaneStatus', () => {
  it('已知狀態原樣回傳，其他（含 undefined、大小寫不同）一律 unknown', () => {
    for (const s of PANE_STATUSES) expect(toPaneStatus(s)).toBe(s);
    expect(toPaneStatus('Working')).toBe('unknown');
    expect(toPaneStatus('')).toBe('unknown');
    expect(toPaneStatus(undefined)).toBe('unknown');
    expect(toPaneStatus('toString')).toBe('unknown');
  });
});
