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

  it('ignores ended contacts', () => {
    const result = extractContacts([
      { liik: 'EMAIL', sisu: 'old@example.ee', lopp_kpv: '01.01.2020' },
      { liik: 'EMAIL', sisu: 'new@example.ee', lopp_kpv: null },
    ]);
    expect(result.email).toBe('new@example.ee');
  });

  it('does not invent contacts when empty', () => {
    const result = extractContacts([]);
    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
    expect(result.website).toBeNull();
  });

  it('accepts TEL as phone', () => {
    const result = extractContacts([{ liik: 'TEL', sisu: '+372 6123456' }]);
    expect(result.phone).toBe('+372 6123456');
  });
});
