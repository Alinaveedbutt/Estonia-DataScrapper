import * as cheerio from 'cheerio';

export interface ExtractedEmail {
  email: string;
  sourceUrl: string;
  sourceType: string;
  confidence: 'high' | 'medium' | 'low';
}

const GENERIC_PREFIXES = ['info', 'hello', 'contact', 'enquiries', 'sales', 'support', 'admin', 'office', 'general', 'reception', 'mail', 'team'];
const IGNORE_PREFIXES = ['example', 'test', 'noreply', 'no-reply', 'donotreply', 'do-not-reply', 'mailer-daemon', 'postmaster'];
const IGNORE_DOMAINS = ['example.com', 'example.co.uk', 'test.com', 'sentry.io', 'wixpress.com', 'wordpress.com'];
const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

export class EmailExtractor {
  public extractEmails(html: string, sourceUrl: string): ExtractedEmail[] {
    const $ = cheerio.load(html);
    const found = new Map<string, ExtractedEmail>();

    // 1. mailto: links (highest confidence)
    $('a[href^="mailto:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const raw = href.replace(/^mailto:/i, '').split('?')[0].trim().toLowerCase();
      if (this.isValid(raw)) {
        found.set(raw, {
          email: raw,
          sourceUrl,
          sourceType: 'mailto_link',
          confidence: this.isGeneric(raw) ? 'high' : 'medium',
        });
      }
    });

    // 2. JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}');
        this.extractFromJsonLd(data, sourceUrl, found);
      } catch {}
    });

    // 3. Visible text and HTML
    const bodyText = $('body').text();
    const bodyHtml = $('body').html() || '';
    for (const text of [bodyText, bodyHtml]) {
      let match;
      const re = new RegExp(EMAIL_REGEX.source, 'gi');
      while ((match = re.exec(text)) !== null) {
        const email = match[0].toLowerCase().trim();
        if (this.isValid(email) && !found.has(email)) {
          found.set(email, {
            email,
            sourceUrl,
            sourceType: 'page_text',
            confidence: this.isGeneric(email) ? 'high' : 'medium',
          });
        }
      }
    }

    // Sort: generic business emails first, then by confidence
    return Array.from(found.values()).sort((a, b) => {
      const aGeneric = this.isGeneric(a.email) ? 0 : 1;
      const bGeneric = this.isGeneric(b.email) ? 0 : 1;
      if (aGeneric !== bGeneric) return aGeneric - bGeneric;
      const confOrder = { high: 0, medium: 1, low: 2 };
      return confOrder[a.confidence] - confOrder[b.confidence];
    });
  }

  /** Extract emails from plain text (search snippets, directory listings). */
  public extractEmailsFromText(text: string, sourceUrl: string): ExtractedEmail[] {
    const found = new Map<string, ExtractedEmail>();
    const re = new RegExp(EMAIL_REGEX.source, 'gi');
    let match;
    while ((match = re.exec(text)) !== null) {
      const email = match[0].toLowerCase().trim();
      if (this.isValid(email) && !found.has(email)) {
        found.set(email, {
          email,
          sourceUrl,
          sourceType: 'public_text',
          confidence: this.isGeneric(email) ? 'high' : 'medium',
        });
      }
    }

    return Array.from(found.values()).sort((a, b) => {
      const aGeneric = this.isGeneric(a.email) ? 0 : 1;
      const bGeneric = this.isGeneric(b.email) ? 0 : 1;
      if (aGeneric !== bGeneric) return aGeneric - bGeneric;
      const confOrder = { high: 0, medium: 1, low: 2 };
      return confOrder[a.confidence] - confOrder[b.confidence];
    });
  }

  private extractFromJsonLd(data: any, sourceUrl: string, found: Map<string, ExtractedEmail>) {
    if (!data || typeof data !== 'object') return;
    if (data.email) {
      const email = String(data.email).replace(/^mailto:/i, '').trim().toLowerCase();
      if (this.isValid(email) && !found.has(email)) {
        found.set(email, { email, sourceUrl, sourceType: 'structured_data', confidence: 'high' });
      }
    }
    if (data.contactPoint) {
      const points = Array.isArray(data.contactPoint) ? data.contactPoint : [data.contactPoint];
      for (const cp of points) {
        this.extractFromJsonLd(cp, sourceUrl, found);
      }
    }
    if (Array.isArray(data)) {
      for (const item of data) this.extractFromJsonLd(item, sourceUrl, found);
    }
  }

  private isValid(email: string): boolean {
    if (!email || !email.includes('@')) return false;
    const [prefix, domain] = email.split('@');
    if (!prefix || !domain) return false;
    if (IGNORE_PREFIXES.includes(prefix)) return false;
    if (IGNORE_DOMAINS.some((d) => domain.endsWith(d))) return false;
    if (/\.(png|jpg|gif|jpeg|svg|css|js|webp)$/i.test(email)) return false;
    if (prefix.length < 2 || domain.length < 4) return false;
    return true;
  }

  private isGeneric(email: string): boolean {
    const prefix = email.split('@')[0];
    return GENERIC_PREFIXES.includes(prefix);
  }
}
