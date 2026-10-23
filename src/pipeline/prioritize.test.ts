import { CompanyRecord } from '../types/company';
import { filterForSheets, prioritizeForOutreach } from './prioritize';

function row(partial: Partial<CompanyRecord>): CompanyRecord {
  return {
    registry_code: '1',
    company_name: 'Test',
    registration_date: '2026-10-01',
    company_status: 'R',
    company_status_text: 'Registrisse kantud',
    legal_form: 'OÜ',
    address_line: null,
    locality: null,
    postal_code: null,
    country: 'Eesti',
    full_address: null,
    website_status: 'NO_WEBSITE',
    website_url: null,
    website_source: null,
    phone: null,
    phone_type: null,
    email: null,
    contact_source: null,
    contact_status: 'NOT_YET_PUBLIC',
    phone_missing_reason: null,
    email_missing_reason: null,
    first_seen: '',
    last_checked: '',
    data_source: 'test',
    ...partial,
  };
}

describe('prioritizeForOutreach', () => {
  it('puts NO_WEBSITE with phone first', () => {
    const ordered = prioritizeForOutreach([
      row({ registry_code: 'a', website_status: 'WEBSITE_EXISTS', phone: '+372 1', email: 'a@a.ee' }),
      row({ registry_code: 'b', website_status: 'NO_WEBSITE', email: 'b@b.ee' }),
      row({ registry_code: 'c', website_status: 'NO_WEBSITE', phone: '+372 2', email: 'c@c.ee' }),
      row({ registry_code: 'd', website_status: 'NO_WEBSITE' }),
    ]);
    expect(ordered.map((r) => r.registry_code)).toEqual(['c', 'b', 'd', 'a']);
  });
});

describe('filterForSheets', () => {
  const rows = [
    row({ registry_code: '1', phone: '+372 1', email: 'a@a.ee' }),
    row({ registry_code: '2', email: 'b@b.ee' }),
    row({ registry_code: '3' }),
    row({ registry_code: '4', website_status: 'WEBSITE_EXISTS', phone: '+372 4' }),
  ];

  it('can require phone for cold-call sheets', () => {
    const filtered = filterForSheets(rows, { requirePhone: true });
    expect(filtered.map((r) => r.registry_code)).toEqual(['1', '4']);
  });

  it('can require any contact and no-website', () => {
    const filtered = filterForSheets(rows, { noWebsiteOnly: true, requireContact: true });
    expect(filtered.map((r) => r.registry_code)).toEqual(['1', '2']);
  });
});
