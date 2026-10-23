import { extractContacts } from './contacts';

describe('extractContacts', () => {
  it('extracts email, mobile, and www from sidevahendid', () => {
    const result = extractContacts([
      { liik: 'EMAIL', sisu: 'info@example.ee' },
      { liik: 'MOB', sisu: '+372 5555555' },
      { liik: 'WWW', sisu: 'example.ee' },
    ]);
    expect(result.email).toBe('info@example.ee');
    expect(result.phone).toBe('+372 5555555');
    expect(result.website).toBe('https://example.ee');
    expect(result.phoneType).toBe('MOB');
  });

  it('prefers MOB over TEL when both exist', () => {
    const result = extractContacts([
      { liik: 'TEL', sisu: '+372 6123456' },
      { liik: 'MOB', sisu: '+372 5550000' },
    ]);
    expect(result.phone).toBe('+372 5550000');
    expect(result.phoneType).toBe('MOB');
  });

  it('accepts TEL when MOB is absent', () => {
    const result = extractContacts([{ liik: 'TEL', sisu: '+372 6123456' }]);
    expect(result.phone).toBe('+372 6123456');
    expect(result.phoneType).toBe('TEL');
  });

  it('ignores ended contacts', () => {
    const result = extractContacts([
      { liik: 'EMAIL', sisu: 'old@example.ee', lopp_kpv: '01.01.2020' },
      { liik: 'EMAIL', sisu: 'new@example.ee', lopp_kpv: null },
      { liik: 'MOB', sisu: '+372 111', lopp_kpv: '01.01.2020' },
      { liik: 'TEL', sisu: '+372 222', lopp_kpv: null },
    ]);
    expect(result.email).toBe('new@example.ee');
    expect(result.phone).toBe('+372 222');
  });

  it('does not invent contacts when empty', () => {
    const result = extractContacts([]);
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.website).toBeNull();
  });
});
