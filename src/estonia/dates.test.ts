import {
  formatDdMmYyyy,
  formatIsoDate,
  formatRunDateTime,
  parseEstonianDate,
  toRegistryDisplayDate,
  toSheetDate,
} from './dates';

describe('Estonian dates', () => {
  it('parses DD.MM.YYYY', () => {
    const d = parseEstonianDate('21.10.2026');
    expect(d).not.toBeNull();
    expect(formatIsoDate(d!)).toBe('2026-10-21');
  });

  it('parses ISO with Z', () => {
    const d = parseEstonianDate('1998-09-23Z');
    expect(formatIsoDate(d!)).toBe('1998-09-23');
  });

  it('returns null for garbage', () => {
    expect(parseEstonianDate('')).toBeNull();
    expect(parseEstonianDate('not-a-date')).toBeNull();
  });

  it('toSheetDate keeps ISO for internal use', () => {
    expect(toSheetDate('05.06.2023')).toBe('2023-06-05');
  });

  it('formats Registry Date as DD/MM/YYYY', () => {
    expect(toRegistryDisplayDate('21.10.2026')).toBe('21/10/2026');
    expect(toRegistryDisplayDate('2026-10-21')).toBe('21/10/2026');
    expect(formatDdMmYyyy(new Date(Date.UTC(2026, 9, 23)))).toBe('23/10/2026');
  });

  it('formats pipeline run datetime', () => {
    expect(formatRunDateTime(new Date('2026-10-23T15:30:00Z'))).toBe('23/10/2026 15:30 UTC');
  });
});
