import axios from 'axios';
import * as cheerio from 'cheerio';

export interface VerificationResult {
  isMatch: boolean;
  confidence: number;
  reasons: string[];
}

const DIRECTORY_DOMAINS = [
  'companieshouse.gov.uk',
  'find-and-update.company-information.service.gov.uk',
  'endole.co.uk',
  'gov.uk',
  'bizdb.co.uk',
  'opencorporates.com',
  'duedil.com',
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'instagram.com',
  'tiktok.com',
  'youtube.com',
  'amazon.co.uk',
  'ebay.co.uk',
  'wikipedia.org',
  'yell.com',
  'yelp.com',
  'trustpilot.com',
  'glassdoor.co.uk',
  'crunchbase.com',
];

export class WebsiteVerifier {
  async verifyWebsite(url: string, companyName: string, locality?: string, postalCode?: string, companyNumber?: string): Promise<VerificationResult> {
    const reasons: string[] = [];
    let score = 0;

    try {
      const domain = new URL(url).hostname.replace(/^www\./, '').toLowerCase();

      // Reject known directories/social media
      if (DIRECTORY_DOMAINS.some((d) => domain.includes(d))) {
        return { isMatch: false, confidence: 0, reasons: ['Known directory/social site'] };
      }

      const response = await axios.get(url, {
        timeout: 10000,
        maxContentLength: 2 * 1024 * 1024,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Accept: 'text/html',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      const $ = cheerio.load(response.data);
      const pageText = $('body').text().toLowerCase();

      // Clean company name for matching (remove Ltd, Limited, etc.)
      const cleanName = companyName
        .replace(/\b(ltd|limited|llp|plc|inc|corp|group|holdings)\b/gi, '')
        .trim();
      const nameTokens = cleanName
        .toLowerCase()
        .split(/[\s\-_&,]+/)
        .filter((t) => t.length > 2);

      // 1. Domain matches company name
      let domainMatchCount = 0;
      for (const token of nameTokens) {
        if (domain.includes(token)) domainMatchCount++;
      }
      if (nameTokens.length > 0 && domainMatchCount >= Math.ceil(nameTokens.length / 2)) {
        score += 40;
        reasons.push('Domain matches company name');
      }

      // 2. Company name appears on page
      if (nameTokens.length > 0) {
        // Escape special regex chars from tokens before creating regex
        const escapedTokens = nameTokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        const namePattern = escapedTokens.join('[\\s\\-_&,]*');
        try {
          const nameRegex = new RegExp(namePattern, 'i');
          if (nameRegex.test(pageText)) {
            score += 25;
            reasons.push('Company name found on page');
          }
        } catch {}
      }

      // 3. Location match
      if (locality && pageText.includes(locality.toLowerCase())) {
        score += 15;
        reasons.push('Locality match');
      }

      // 4. Postal code match
      if (postalCode) {
        const pcBase = postalCode.split(' ')[0].toLowerCase();
        if (pageText.includes(pcBase)) {
          score += 10;
          reasons.push('Postal code match');
        }
      }

      // 5. Registration number on page
      if (companyNumber && pageText.includes(companyNumber.toLowerCase())) {
        score += 50;
        reasons.push('Company number found on page');
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
