import { formatIsoDate, parseEstonianDate, toSheetDate } from './dates';

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

  it('toSheetDate converts register format', () => {
    expect(toSheetDate('05.06.2023')).toBe('2023-06-05');
  });
});
