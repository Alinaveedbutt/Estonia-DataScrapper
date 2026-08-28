import axios from 'axios';
import * as cheerio from 'cheerio';
import { EmailExtractor, ExtractedEmail } from '../contacts/email-extractor';
import { PhoneExtractor, ExtractedPhone } from '../contacts/phone-extractor';
import { config } from '../config/env';

export interface CrawlerResult {
  emails: ExtractedEmail[];
  phones: ExtractedPhone[];
  pagesChecked: number;
}

export class Crawler {
  private emailExtractor = new EmailExtractor();
  private phoneExtractor = new PhoneExtractor();

  private defaultPaths = [
    '',           // homepage
    '/contact',
    '/contact-us',
    '/contactus',
    '/about',
    '/about-us',
    '/aboutus',
    '/support',
    '/legal',
    '/terms',
    '/get-in-touch',
    '/enquiries',
  ];

  public async crawlForContacts(baseUrl: string): Promise<CrawlerResult> {
    const maxPages = config.app.crawlMaxPages;
    const allEmails: ExtractedEmail[] = [];
    const allPhones: ExtractedPhone[] = [];
    let pagesChecked = 0;

    let origin: string;
    try {
      // Allow implicit http if missing
      const urlWithProto = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
      origin = new URL(urlWithProto).origin;
    } catch {
      return { emails: [], phones: [], pagesChecked: 0 };
    }

    const pathsToCheck = [...this.defaultPaths];
    const checkedUrls = new Set<string>();

    for (let i = 0; i < pathsToCheck.length; i++) {
      if (pagesChecked >= maxPages) break;

      const path = pathsToCheck[i];
      const url = `${origin}${path}`;
      if (checkedUrls.has(url)) continue;
      checkedUrls.add(url);

      try {
        const response = await axios.get(url, {
          timeout: 10000,
          maxContentLength: 2 * 1024 * 1024, // 2MB max
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html,application/xhtml+xml',
          },
          validateStatus: (s) => s >= 200 && s < 400,
        });

        const html = response.data;
        if (typeof html !== 'string') continue;
        pagesChecked++;

        // Extract contacts from this page
        const pageEmails = this.emailExtractor.extractEmails(html, url);
        const pagePhones = this.phoneExtractor.extractPhones(html, url);

        for (const pe of pageEmails) {
          if (!allEmails.some((e) => e.email === pe.email)) allEmails.push(pe);
        }
        for (const pp of pagePhones) {
          if (!allPhones.some((p) => p.normalized === pp.normalized)) allPhones.push(pp);
        }

        // On homepage, discover real contact/about pages from navigation links
        if (path === '') {
          const $ = cheerio.load(html);
          $('a[href]').each((_, el) => {
            const href = $(el).attr('href');
            if (!href) return;
            const text = $(el).text().toLowerCase();
            const hrefLower = href.toLowerCase();
            const isContactLink =
              text.includes('contact') ||
              text.includes('about') ||
              text.includes('get in touch') ||
              text.includes('enquir') ||
              hrefLower.includes('contact') ||
              hrefLower.includes('about') ||
              hrefLower.includes('get-in-touch') ||
              hrefLower.includes('enquir');

            if (isContactLink) {
              try {
                const resolved = new URL(href, origin);
                if (resolved.origin === origin) {
                  const newPath = resolved.pathname;
                  if (!pathsToCheck.includes(newPath) && !checkedUrls.has(`${origin}${newPath}`)) {
                    pathsToCheck.push(newPath);
                  }
                }
              } catch {}
            }
          });
        }
      } catch (error: any) {
        // Silently skip failed pages
      }
    }

    return { emails: allEmails, phones: allPhones, pagesChecked };
  }
}
