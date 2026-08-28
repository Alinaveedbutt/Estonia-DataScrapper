import { isEligibleForReEnrichment, parseReEnrichmentSchedule, isCompanyIncomplete } from './re-enrichment';
import { Company } from '@prisma/client';

function company(partial: Partial<Company>): Company {
  return {
    company_number: '1',
    company_name: 'Test',
    date_of_creation: new Date(),
    company_status: 'active',
    company_type: 'ltd',
    address_line_1: null,
    address_line_2: null,
    locality: null,
    region: null,
    postal_code: null,
    country: null,
    full_address: null,
    phone: null,
    phone_normalized: null,
    phone_source_url: null,
    phone_source_type: null,
    phone_confidence: null,
    phone_last_checked: null,
    phone_missing_reason: null,
    email: null,
    email_source_url: null,
    email_source_type: null,
    email_confidence: null,
    email_last_checked: null,
    email_missing_reason: null,
    contact_status: 'NO_CONTACT_FOUND',
    missing_reason: null,
    processing_status: 'completed',
    enrichment_attempts: 1,
    last_enrichment_attempt: new Date('2026-08-26'),
    first_seen: new Date('2026-08-25'),
    last_checked: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...partial,
  };
}

describe('re-enrichment', () => {
  it('parses configurable schedule', () => {
    expect(parseReEnrichmentSchedule('1,3,7,14,30')).toEqual([1, 3, 7, 14, 30]);
    expect(parseReEnrichmentSchedule('invalid')).toEqual([1, 3, 7, 14, 30]);
  });

  it('detects incomplete companies', () => {
    expect(isCompanyIncomplete(company({ phone: '+44 1', email: 'a@b.co' }))).toBe(false);
    expect(isCompanyIncomplete(company({ phone: null }))).toBe(true);
  });

  it('allows re-enrichment when schedule day reached', () => {
    const schedule = [1, 3, 7, 14, 30];
    const c = company({
      enrichment_attempts: 1,
      first_seen: new Date('2026-08-24'),
      last_enrichment_attempt: new Date('2026-08-26'),
    });
    expect(isEligibleForReEnrichment(c, schedule, new Date('2026-08-27'))).toBe(true);
  });

  it('blocks re-enrichment when max attempts reached', () => {
    const schedule = [1, 3, 7, 14, 30];
    const c = company({ enrichment_attempts: 5 });
    expect(isEligibleForReEnrichment(c, schedule, new Date())).toBe(false);
  });

  it('blocks re-enrichment when company is complete', () => {
    const schedule = [1, 3, 7, 14, 30];
    const c = company({
      phone: '+44 20 1',
      email: 'a@b.co',
    });
    expect(isEligibleForReEnrichment(c, schedule, new Date())).toBe(false);
  });
});
