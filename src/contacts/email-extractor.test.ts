import { EmailExtractor } from './email-extractor';

describe('EmailExtractor', () => {
  const extractor = new EmailExtractor();

  it('extracts email from mailto links', () => {
    const html = '<html><body><a href="mailto:info@acmecorp.co.uk">Email</a></body></html>';
    const emails = extractor.extractEmails(html, 'https://acme.co.uk');
    expect(emails.some((e) => e.email === 'info@acmecorp.co.uk')).toBe(true);
  });

  it('extracts email from plain text', () => {
    const text = 'Contact Missing Corp at enquiries@missingcorp.co.uk for details';
    const emails = extractor.extractEmailsFromText(text, 'https://yell.com');
    expect(emails.some((e) => e.email === 'enquiries@missingcorp.co.uk')).toBe(true);
  });

  it('rejects example.com addresses', () => {
    const text = 'Email test@example.com for info';
    const emails = extractor.extractEmailsFromText(text, 'https://example.com');
    expect(emails.length).toBe(0);
  });

  it('rejects noreply addresses', () => {
    const html = '<a href="mailto:noreply@company.co.uk">x</a>';
    const emails = extractor.extractEmails(html, 'https://company.co.uk');
    expect(emails.length).toBe(0);
  });
});
