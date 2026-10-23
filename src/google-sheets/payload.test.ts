import { mapCompany } from '../estonia/mapper';
import fixtures from '../estonia/fixtures/sample-companies.json';
import { toSheetsRow } from './row';

describe('Sheets 7-column payload', () => {
  it('maps NO_WEBSITE lead to Yes/No website and DD/MM/YYYY registry date', () => {
    const mapped = mapCompany(fixtures[0], {
      websiteStatus: 'NO_WEBSITE',
      websiteUrl: null,
      websiteSource: null,
    });
    const row = toSheetsRow(mapped, new Date('2026-10-23T15:30:00Z'));

    expect(row.run_date).toBe('23/10/2026 15:30 UTC');
    expect(row.registry_code).toBe('17630099');
    expect(row.company_name).toBe('0111 Productions OÜ');
    expect(row.registry_date).toBe('21/10/2026');
    expect(row.website_status).toBe('No');
    expect(row.email).toBe('a.zazhitskaya@gmail.com');
    expect(row.phone).toBe('+372 58291086');
    expect(Object.keys(row)).toEqual([
      'run_date',
      'registry_code',
      'company_name',
      'registry_date',
      'website_status',
      'email',
      'phone',
    ]);
  });

  it('maps WEBSITE_EXISTS to Yes', () => {
    const mapped = mapCompany(fixtures[1], {
      websiteStatus: 'WEBSITE_EXISTS',
      websiteUrl: 'https://kilomotors.ee/',
      websiteSource: 'e-Business Register (WWW)',
    });
    const row = toSheetsRow(mapped, new Date('2026-10-23T12:00:00Z'));
    expect(row.website_status).toBe('Yes');
    expect(row.registry_date).toBe('14/10/2026');
  });

  it('leaves phone empty when register has none (never invents)', () => {
    const mapped = mapCompany(
      {
        ariregistri_kood: 9,
        nimi: 'No Phone OÜ',
        yldandmed: {
          esmaregistreerimise_kpv: '01.01.2026',
          sidevahendid: [{ liik: 'EMAIL', sisu: 'only@email.ee' }],
        },
      },
      { websiteStatus: 'NO_WEBSITE', websiteUrl: null, websiteSource: null }
    );
    const row = toSheetsRow(mapped);
    expect(row.phone).toBe('');
    expect(row.email).toBe('only@email.ee');
    expect(row.website_status).toBe('No');
  });
});
