import { mapCompany } from '../estonia/mapper';
import fixtures from '../estonia/fixtures/sample-companies.json';

/** Mirror Apps Script companyToRow field order for regression safety. */
function toSheetsPayload(c: ReturnType<typeof mapCompany>) {
  return {
    registry_code: c.registry_code || '',
    company_name: c.company_name || '',
    registration_date: c.registration_date || '',
    company_status: c.company_status || '',
    company_status_text: c.company_status_text || '',
    legal_form: c.legal_form || '',
    address_line: c.address_line || '',
    locality: c.locality || '',
    postal_code: c.postal_code || '',
    country: c.country || '',
    full_address: c.full_address || '',
    website_status: c.website_status || '',
    website_url: c.website_url || '',
    website_source: c.website_source || '',
    phone: c.phone || '',
    phone_type: c.phone_type || '',
    email: c.email || '',
    contact_source: c.contact_source || '',
    contact_status: c.contact_status || '',
    phone_missing_reason: c.phone_missing_reason || '',
    email_missing_reason: c.email_missing_reason || '',
    first_seen: c.first_seen || '',
    last_checked: c.last_checked || '',
    data_source: c.data_source || '',
  };
}

describe('Sheets payload phone field', () => {
  it('includes official phone on NO_WEBSITE rows when register has MOB', () => {
    const mapped = mapCompany(fixtures[0], {
      websiteStatus: 'NO_WEBSITE',
      websiteUrl: null,
      websiteSource: null,
    });
    const payload = toSheetsPayload(mapped);
    expect(payload.phone).toBe('+372 58291086');
    expect(payload.phone_type).toBe('MOB');
    expect(payload.email).toBe('a.zazhitskaya@gmail.com');
    expect(payload.website_status).toBe('NO_WEBSITE');
    expect(payload.contact_status).toBe('COMPLETE');
  });

  it('keeps phone empty string (not invented) when register has none', () => {
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
    const payload = toSheetsPayload(mapped);
    expect(payload.phone).toBe('');
    expect(payload.email).toBe('only@email.ee');
    expect(payload.phone_missing_reason).toContain('Not published');
  });
});
