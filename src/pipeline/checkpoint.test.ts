import { getScanDateRange, rangeFromExplicit, shouldAdvanceCheckpoint } from './checkpoint';

describe('getScanDateRange', () => {
  it('always uses rolling lookback (ignores checkpoint)', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const first = getScanDateRange(null, now, 3);
    const withCheckpoint = getScanDateRange('2026-10-22', now, 3);
    expect(first.fromDate).toBe('2026-10-20');
    expect(first.toDate).toBe('2026-10-22');
    expect(first.dates).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
    // Same window even when checkpoint says "already done"
    expect(withCheckpoint).toEqual(first);
  });

  it('uses full lookback of 7 days', () => {
    const now = new Date('2026-10-23T12:00:00Z');
    const range = getScanDateRange('2026-10-22', now, 7);
    expect(range.fromDate).toBe('2026-10-16');
    expect(range.toDate).toBe('2026-10-22');
    expect(range.dates).toHaveLength(7);
  });
});

describe('rangeFromExplicit', () => {
  it('expands inclusive dates', () => {
    const range = rangeFromExplicit('2026-10-20', '2026-10-22');
    expect(range.dates).toEqual(['2026-10-20', '2026-10-21', '2026-10-22']);
  });
});

describe('shouldAdvanceCheckpoint', () => {
  it('advances only on success with dates', () => {
    expect(shouldAdvanceCheckpoint(true, true)).toBe(true);
    expect(shouldAdvanceCheckpoint(false, true)).toBe(false);
    expect(shouldAdvanceCheckpoint(true, false)).toBe(false);
  });
});
