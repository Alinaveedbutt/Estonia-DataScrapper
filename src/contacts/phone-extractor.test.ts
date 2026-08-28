import { PhoneExtractor } from './phone-extractor';

describe('PhoneExtractor', () => {
  const extractor = new PhoneExtractor();

  it('extracts phone from tel: links in HTML', () => {
    const html = '<html><body><a href="tel:02079460958">Call</a></body></html>';
    const phones = extractor.extractPhones(html, 'https://example.co.uk/contact');
    expect(phones.length).toBeGreaterThan(0);
    expect(phones[0].normalized).toMatch(/^\+44/);
    expect(phones[0].sourceType).toBe('tel_link');
  });

  it('extracts phone from plain text snippets', () => {
    const text = 'Missing Corp Manchester phone 0161 496 0000 for enquiries';
    const phones = extractor.extractPhonesFromText(text, 'https://yell.com/listing');
    expect(phones.length).toBeGreaterThan(0);
    expect(phones[0].sourceType).toBe('public_text');
  });

  it('extracts phone from JSON-LD structured data', () => {
    const html = `<html><head><script type="application/ld+json">{"telephone":"+44 161 496 0000"}</script></head><body></body></html>`;
    const phones = extractor.extractPhones(html, 'https://example.co.uk');
    expect(phones.some((p) => p.sourceType === 'structured_data')).toBe(true);
  });
});
