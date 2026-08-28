import {
  filterYolistByCompanyName,
  isMaskedPhone,
  yolistBusinessToText,
  buildYolistQueryParams,
} from './client';

describe('Yolist client', () => {
  it('builds query params from postcode and locality', () => {
    const params = buildYolistQueryParams({ locality: 'London', postalCode: 'EC1A 1BB' });
    expect(params.postcode).toBe('EC1A');
    expect(params.city).toBe('london');
  });

  it('filters businesses by company name tokens', () => {
    const matches = filterYolistByCompanyName(
      [
        { id: '1', name: 'Acme Plumbing Ltd', phone: '020 7946 0000' },
        { id: '2', name: 'Unrelated Services', phone: '0161 123 4567' },
      ],
      'Acme Plumbing Limited'
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].name).toContain('Acme');
  });

  it('detects masked phone numbers', () => {
    expect(isMaskedPhone('0207 ****234')).toBe(true);
    expect(isMaskedPhone('020 7946 0000')).toBe(false);
  });

  it('serialises business record to searchable text', () => {
    const text = yolistBusinessToText({
      id: 'x',
      name: 'Beta Services Ltd',
      phone: '0161 496 0000',
      website: 'https://beta.example',
      addressLine1: '1 High Street',
      postcode: 'M1 1AA',
    });
    expect(text).toContain('Beta Services');
    expect(text).toContain('0161 496 0000');
    expect(text).toContain('M1 1AA');
  });
});
