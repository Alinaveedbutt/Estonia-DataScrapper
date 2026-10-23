import { mapCompany, registryWebsite } from './mapper';
import fixtures from './fixtures/sample-companies.json';

describe('mapCompany', () => {
  const sample = fixtures[0];

  it('maps identity, address, and official contacts', () => {
    const row = mapCompany(sample, {
      websiteStatus: 'NO_WEBSITE',
      websiteUrl: null,
      websiteSource: null,
      now: new Date('2026-10-23T12:00:00Z'),
    });

    expect(row.registry_code).toBe('17630099');
    expect(row.company_name).toBe('0111 Productions OÜ');
    expect(row.registration_date).toBe('2026-10-21');
    expect(row.phone).toBe('+372 58291086');
    expect(row.email).toBe('a.zazhitskaya@gmail.com');
    expect(row.contact_status).toBe('COMPLETE');
    expect(row.website_status).toBe('NO_WEBSITE');
    expect(row.country).toBe('Eesti');
    expect(row.data_source).toContain('avaandmed');
  });

  it('reads registry WWW', () => {
    expect(registryWebsite(fixtures[1])).toBe('https://kilomotors.ee/');
  });

  it('marks partial when only email', () => {
    const row = mapCompany(
      {
        ariregistri_kood: 1,
        nimi: 'Test OÜ',
        yldandmed: {
          esmaregistreerimise_kpv: '01.01.2026',
          sidevahendid: [{ liik: 'EMAIL', sisu: 'a@b.ee' }],
        },
      },
      { websiteStatus: 'NO_WEBSITE', websiteUrl: null, websiteSource: null }
    );
    expect(row.contact_status).toBe('PARTIAL');
    expect(row.phone_missing_reason).toContain('Not published');
  });
});
