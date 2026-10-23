import axios from 'axios';
import * as cheerio from 'cheerio';

export interface VerificationResult {
  isMatch: boolean;
  confidence: number;
  reasons: string[];
}

const DIRECTORY_DOMAINS = [
  'ariregister.rik.ee',
  'rik.ee',
  'opencorporates.com',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'wikipedia.org',
  'yelp.com',
  'trustpilot.com',
  'crunchbase.com',
  'google.com',
  'bing.com',
];

const LEGAL_SUFFIXES =
  /\b(oü|ou|osaühing|as|aktsiaselts|tü|tu|tulundusühistu|mtü|mtu|mittetulundusühing|fie|uü|uu|ltd|limited|inc|corp|group|holdings)\b/gi;

export class WebsiteVerifier {
  async verifyWebsite(
    url: string,
    companyName: string,
    locality?: string,
    postalCode?: string,
    registryCode?: string
  ): Promise<VerificationResult> {
    const reasons: string[] = [];
    let score = 0;

    try {
      const domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

      if (DIRECTORY_DOMAINS.some((d) => domain.includes(d))) {
        return { isMatch: false, confidence: 0, reasons: ['Known directory/social site'] };
      }

      const response = await axios.get(url, {
        timeout: 10000,
        maxContentLength: 2 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; EstoniaCompanyPipeline/1.0)',
          Accept: 'text/html',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      const $ = cheerio.load(response.data);
      const pageText = $('body').text().toLowerCase();

      const cleanName = companyName.replace(LEGAL_SUFFIXES, '').trim();
      const nameTokens = cleanName
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[\s\-_&,]+/)
        .filter((t) => t.length > 2);

      let domainMatchCount = 0;
      for (const token of nameTokens) {
        if (domain.includes(token)) domainMatchCount++;
      }
      if (nameTokens.length > 0 && domainMatchCount >= Math.ceil(nameTokens.length / 2)) {
        score += 40;
        reasons.push('Domain matches company name');
      }

      if (nameTokens.length > 0) {
        const escapedTokens = nameTokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const namePattern = escapedTokens.join('[\\s\\-_&,]*');
        try {
          const nameRegex = new RegExp(namePattern, 'i');
          if (nameRegex.test(pageText)) {
            score += 25;
            reasons.push('Company name found on page');
          }
        } catch {
          /* ignore bad regex */
        }
      }

      if (locality) {
        const loc = locality.toLowerCase().split(',')[0]?.trim();
        if (loc && pageText.includes(loc)) {
          score += 15;
          reasons.push('Locality match');
        }
      }

      if (postalCode && pageText.includes(postalCode.toLowerCase())) {
        score += 10;
        reasons.push('Postal code match');
      }

      if (registryCode && pageText.includes(String(registryCode).toLowerCase())) {
        score += 50;
        reasons.push('Registry code found on page');
      }

      return {
        isMatch: score >= 30,
        confidence: Math.min(100, Math.max(0, score)),
        reasons,
      };
    } catch {
      return { isMatch: false, confidence: 0, reasons: ['Failed to fetch website'] };
    }
  }
}
