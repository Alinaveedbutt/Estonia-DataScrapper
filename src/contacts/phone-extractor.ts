import * as cheerio from 'cheerio';
import { parsePhoneNumberFromString, PhoneNumber } from 'libphonenumber-js';

export interface ExtractedPhone {
  raw: string;
  normalized: string;
  sourceUrl: string;
  sourceType: string;
  confidence: 'high' | 'medium' | 'low';
}

// Broader regex to catch UK phone numbers in various formats
const PHONE_PATTERNS = [
  /(?:\+44\s?\(?0?\)?\s?|0)(?:\d[\s\-]?){9,10}/g,   // standard UK
  /\+44\s?\d[\d\s\-]{8,13}/g,                          // international
  /(?:tel|phone|telephone|call)[:\s]+([\d\s\+\-\(\)]{10,})/gi, // labeled
];

export class PhoneExtractor {
  public extractPhones(html: string, sourceUrl: string): ExtractedPhone[] {
    const $ = cheerio.load(html);
    const found = new Map<string, ExtractedPhone>();

    // 1. tel: links (highest confidence)
    $('a[href^="tel:"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const raw = href.replace(/^tel:/i, '').trim();
      this.tryAdd(raw, sourceUrl, 'tel_link', 'high', found);
    });

    // 2. JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const data = JSON.parse($(el).html() || '{}');
        this.extractFromJsonLd(data, sourceUrl, found);
      } catch {}
    });

    // 3. HTML attributes (itemProp, etc)
    $('[itemprop="telephone"]').each((_, el) => {
      const text = $(el).text().trim() || $(el).attr('content') || '';
      if (text) this.tryAdd(text, sourceUrl, 'microdata', 'high', found);
    });

    // 4. Visible text
    const text = $('body').text().replace(/\s+/g, ' ');
    for (const pattern of PHONE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(text)) !== null) {
        // Use the captured group if there is one, else the full match
        const raw = (match[1] || match[0]).trim();
        this.tryAdd(raw, sourceUrl, 'page_text', 'medium', found);
      }
    }

    return Array.from(found.values()).sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 };
      return confOrder[a.confidence] - confOrder[b.confidence];
    });
  }

  /** Extract phones from plain text (search snippets, directory listings). */
  public extractPhonesFromText(text: string, sourceUrl: string): ExtractedPhone[] {
    const found = new Map<string, ExtractedPhone>();
    const normalizedText = text.replace(/\s+/g, ' ');

    for (const pattern of PHONE_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(normalizedText)) !== null) {
        const raw = (match[1] || match[0]).trim();
        this.tryAdd(raw, sourceUrl, 'public_text', 'medium', found);
      }
    }

    return Array.from(found.values()).sort((a, b) => {
      const confOrder = { high: 0, medium: 1, low: 2 };
      return confOrder[a.confidence] - confOrder[b.confidence];
    });
  }

  private tryAdd(
    raw: string,
    sourceUrl: string,
    sourceType: string,
    confidence: 'high' | 'medium' | 'low',
    map: Map<string, ExtractedPhone>
  ) {
    const cleaned = raw.replace(/[^\d\+\s\-\(\)]/g, '').trim();
    if (!cleaned || cleaned.length < 10) return;

    const parsed = parsePhoneNumberFromString(cleaned, 'GB');
    if (parsed && parsed.isValid()) {
      const normalized = parsed.formatInternational();
      if (!map.has(normalized)) {
        // Lower confidence for mobile numbers in business context
        const isMobile = parsed.getType() === 'MOBILE';
        const finalConf = isMobile && confidence === 'high' ? 'medium' : confidence;
        map.set(normalized, { raw, normalized, sourceUrl, sourceType, confidence: finalConf });
      }
    }
  }

  private extractFromJsonLd(data: any, sourceUrl: string, map: Map<string, ExtractedPhone>) {
    if (!data || typeof data !== 'object') return;
    if (typeof data.telephone === 'string') {
      this.tryAdd(data.telephone, sourceUrl, 'structured_data', 'high', map);
    }
    if (Array.isArray(data.telephone)) {
      for (const t of data.telephone) {
        if (typeof t === 'string') this.tryAdd(t, sourceUrl, 'structured_data', 'high', map);
      }
    }
    if (data.contactPoint) {
      const points = Array.isArray(data.contactPoint) ? data.contactPoint : [data.contactPoint];
      for (const cp of points) this.extractFromJsonLd(cp, sourceUrl, map);
    }
    if (Array.isArray(data)) {
      for (const item of data) this.extractFromJsonLd(item, sourceUrl, map);
    }
  }
}
