import axios from 'axios';
import * as cheerio from 'cheerio';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage } from './types';
import { PublicSourceSession, globalPublicSourceSession } from './session';

export { PublicSourcePage, PublicSourceProvider } from './types';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9',
};

export async function fetchPublicPage(
  url: string,
  budget: EnrichmentBudget,
  sourceType: string,
  title: string,
  session: PublicSourceSession = globalPublicSourceSession
): Promise<PublicSourcePage | null> {
  if (session.isBlocked(sourceType)) return null;
  if (!budget.canFetch()) return null;

  if (session.hasCache(url)) {
    return session.getCache(url) ?? null;
  }

  budget.recordFetch();
  const timeout = Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs);

  try {
    const response = await axios.get(url, {
      timeout,
      maxContentLength: 512 * 1024,
      headers: BROWSER_HEADERS,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    if (typeof response.data !== 'string') {
      session.setCache(url, null);
      return null;
    }

    const $ = cheerio.load(response.data);
    const text = $('body').text().replace(/\s+/g, ' ').substring(0, 15000);
    const page: PublicSourcePage = { url, title, text, sourceType };
    session.setCache(url, page);
    return page;
  } catch (error: any) {
    const status = error?.response?.status;
    if (status === 403 || status === 429) {
      session.block(sourceType, `HTTP ${status}`);
    }
    console.warn(`[PublicSource] Failed ${sourceType} (${url}): ${error.message}`);
    session.setCache(url, null);
    return null;
  }
}

export function extractLinksFromHtml(html: string): string[] {
  const $ = cheerio.load(html);
  const links: string[] = [];
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.startsWith('http://') || href.startsWith('https://'))) {
      links.push(href);
    }
  });
  return links;
}
