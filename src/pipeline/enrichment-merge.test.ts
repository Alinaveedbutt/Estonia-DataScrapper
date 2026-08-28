import { mergeEnrichmentResults } from './enrichment-merge';
import { Company } from '@prisma/client';

function baseCompany(overrides: Partial<Company> = {}): Company {
  return {
    company_number: '12345678',
    company_name: 'Test Ltd',
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
    phone: '+44 20 7123 4567',
    phone_normalized: '+44 20 7123 4567',
    phone_source_url: 'https://existing.co.uk/contact',
    phone_source_type: 'tel_link',
    phone_confidence: 'high',
    phone_last_checked: new Date(),
    phone_missing_reason: null,
    email: 'info@existing.co.uk',
    email_source_url: 'https://existing.co.uk/contact',
    email_source_type: 'mailto_link',
    email_confidence: 'high',
    email_last_checked: new Date(),
    email_missing_reason: null,
    contact_status: 'COMPLETE',
    missing_reason: null,
    processing_status: 'completed',
    enrichment_attempts: 1,
    last_enrichment_attempt: new Date(),
    first_seen: new Date(),
    last_checked: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('mergeEnrichmentResults', () => {
  it('never overwrites existing phone/email with null', () => {
    const existing = baseCompany();
    const merged = mergeEnrichmentResults(existing, {
      phone: null,
      phoneSourceUrl: null,
      phoneSourceType: null,
      phoneConfidence: null,
      phoneMissingReason: 'no_public_phone',
      email: null,
      emailSourceUrl: null,
      emailSourceType: null,
      emailConfidence: null,
      emailMissingReason: 'no_public_email',
      contactStatus: 'NOT_YET_PUBLIC',
      missingReason: 'not_yet_public',
      enrichmentSucceeded: true,
    });

    expect(merged.phone).toBe('+44 20 7123 4567');
    expect(merged.email).toBe('info@existing.co.uk');
    expect(merged.contact_status).toBe('COMPLETE');
  });

  it('marks successful no-contact runs as NOT_YET_PUBLIC', () => {
    const merged = mergeEnrichmentResults(null, {
      phone: null,
      phoneSourceUrl: null,
      phoneSourceType: null,
      phoneConfidence: null,
      phoneMissingReason: 'no_public_phone',
      email: null,
      emailSourceUrl: null,
      emailSourceType: null,
      emailConfidence: null,
      emailMissingReason: 'no_public_email',
      contactStatus: 'PENDING',
      missingReason: null,
      enrichmentSucceeded: true,
    });
    expect(merged.contact_status).toBe('NOT_YET_PUBLIC');
    expect(merged.missing_reason).toBe('not_yet_public');
  });

  it('marks provider errors as EXTRACTION_FAILURE', () => {
    const merged = mergeEnrichmentResults(null, {
      phone: null,
      phoneSourceUrl: null,
      phoneSourceType: null,
      phoneConfidence: null,
      phoneMissingReason: 'no_public_phone',
      email: null,
      emailSourceUrl: null,
      emailSourceType: null,
      emailConfidence: null,
      emailMissingReason: 'no_public_email',
      contactStatus: 'PENDING',
      missingReason: null,
      enrichmentSucceeded: false,
    });
    expect(merged.contact_status).toBe('EXTRACTION_FAILURE');
    expect(merged.missing_reason).toBe('extraction_failure');
  });

  it('accepts better new phone when confidence is higher', () => {
    const existing = baseCompany({ phone_confidence: 'low', phone: '+44 20 7000 0000', phone_normalized: '+44 20 7000 0000' });
    const merged = mergeEnrichmentResults(existing, {
      phone: '+44 20 7123 4567',
      phoneSourceUrl: 'https://existing.co.uk',
      phoneSourceType: 'tel_link',
      phoneConfidence: 'high',
      phoneMissingReason: null,
      email: 'info@existing.co.uk',
      emailSourceUrl: 'https://existing.co.uk',
      emailSourceType: 'mailto_link',
      emailConfidence: 'high',
      emailMissingReason: null,
      contactStatus: 'COMPLETE',
      missingReason: null,
    });

    expect(merged.phone).toBe('+44 20 7123 4567');
    expect(merged.phone_confidence).toBe('high');
  });
});
