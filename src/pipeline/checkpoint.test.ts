import { getScanDateRange, shouldAdvanceCheckpoint } from './checkpoint';

describe('getScanDateRange', () => {
  it('uses lookback on first run', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const range = getScanDateRange(null, now, 3);
    expect(range.fromDate).toBe('2026-10-20');
    expect(range.toDate).toBe('2026-10-22');
    expect(range.dates).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });

  it('continues from checkpoint', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const range = getScanDateRange('2026-10-20', now, 7);
    expect(range.fromDate).toBe('2026-10-21');
    expect(range.toDate).toBe('2026-10-22');
  });

  it('returns empty when checkpoint is current', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const range = getScanDateRange('2026-10-22', now, 7);
    expect(range.dates).toEqual([]);
  });
});

describe('shouldAdvanceCheckpoint', () => {
  it('advances only on success with dates', () => {
    expect(shouldAdvanceCheckpoint(true, true)).toBe(true);
    expect(shouldAdvanceCheckpoint(false, true)).toBe(false);
    expect(shouldAdvanceCheckpoint(true, false)).toBe(false);
  });
});
