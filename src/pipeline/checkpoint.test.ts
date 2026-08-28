import { getScanDateRange, shouldAdvanceCheckpoint } from './checkpoint';
import { addDays, format, startOfDay, subDays } from 'date-fns';

describe('checkpoint', () => {
  it('scans yesterday on first run when no checkpoint exists', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const range = getScanDateRange(null, now);
    expect(range.dates).toEqual(['2026-08-27']);
  });

  it('scans from day after last successful scan through yesterday', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const last = startOfDay(new Date('2026-08-25T00:00:00Z'));
    const range = getScanDateRange(last, now);
    expect(range.dates).toEqual(['2026-08-26', '2026-08-27']);
  });

  it('returns empty dates when checkpoint is already current', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const last = startOfDay(subDays(now, 1));
    const range = getScanDateRange(last, now);
    expect(range.dates).toEqual([]);
  });

  it('does not advance checkpoint when run failed', () => {
    expect(shouldAdvanceCheckpoint(false, new Date())).toBe(false);
  });

  it('advances checkpoint only on successful run with completed date', () => {
    expect(shouldAdvanceCheckpoint(true, new Date('2026-08-27'))).toBe(true);
    expect(shouldAdvanceCheckpoint(true, null)).toBe(false);
  });
});

describe('incremental scan date formatting', () => {
  it('formats scan dates as yyyy-MM-dd', () => {
    const now = new Date('2026-08-28T12:00:00Z');
    const last = startOfDay(new Date('2026-08-24T00:00:00Z'));
    const range = getScanDateRange(last, now);
    expect(range.dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect(range.dates[0]).toBe(format(addDays(last, 1), 'yyyy-MM-dd'));
  });
});
