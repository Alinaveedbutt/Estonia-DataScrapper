import axios from 'axios';
import * as cheerio from 'cheerio';
import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { fetchPublicPage, extractLinksFromHtml } from './fetch';
import { PublicSourcePage, PublicSourceProvider } from './types';
import { PublicSourceSession } from './session';

const MIN_USEFUL_PAGE_BYTES = 3500;

export function isStubPage(htmlLength: number, text: string): boolean {
  if (htmlLength < MIN_USEFUL_PAGE_BYTES) return true;
  const lower = text.toLowerCase();
  if (lower.includes('opencorporates') && !lower.includes('registered address') && text.length < 800) {
    return true;
  }
  return false;
}

export class CompaniesHousePageProvider implements PublicSourceProvider {
  name = 'CompaniesHousePublicPage';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    const url = `https://find-and-update.company-information.service.gov.uk/company/${ctx.companyNumber}`;
    if (session?.isBlocked('companies_house_page')) return [];
    if (!budget.canFetch()) return [];

    if (session?.hasCache(url)) {
      const cached = session.getCache(url);
      return cached ? [cached] : [];
    }

    budget.recordFetch();
    const timeout = Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs);

    try {
      const response = await axios.get(url, {
        timeout,
        maxContentLength: 512 * 1024,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      if (typeof response.data !== 'string') {
        session?.setCache(url, null);
        return [];
      }

      const $ = cheerio.load(response.data);
      const bodyText = $('body').text().replace(/\s+/g, ' ').substring(0, 12000);
      const links = extractLinksFromHtml(response.data).join(' ');
      const text = `${bodyText} ${links}`;

      const page: PublicSourcePage = { url, title: ctx.companyName, text, sourceType: 'companies_house_page' };
      session?.setCache(url, page);
      return [page];
    } catch (error: any) {
      console.warn(`[PublicSource] Failed companies_house_page (${url}): ${error.message}`);
      session?.setCache(url, null);
      return [];
    }
  }
}

export class OpenCorporatesProvider implements PublicSourceProvider {
  name = 'OpenCorporates';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('opencorporates')) return [];

    const url = `https://opencorporates.com/companies/gb/${ctx.companyNumber}`;
    if (!budget.canFetch()) return [];

    if (session?.hasCache(url)) {
      const cached = session.getCache(url);
      return cached ? [cached] : [];
    }

    budget.recordFetch();
    const timeout = Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs);

    try {
      const response = await axios.get(url, {
        timeout,
        maxContentLength: 512 * 1024,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html',
        },
        validateStatus: (s) => s >= 200 && s < 400,
      });

      const html = typeof response.data === 'string' ? response.data : '';
      const $ = cheerio.load(html);
      const text = $('body').text().replace(/\s+/g, ' ').substring(0, 15000);

      if (isStubPage(html.length, text)) {
        console.warn(`[PublicSource] OpenCorporates stub for ${ctx.companyNumber} (${html.length}b) — skipping`);
        session?.block('opencorporates', 'stub page');
        session?.setCache(url, null);
        return [];
      }

      const page: PublicSourcePage = { url, title: ctx.companyName, text, sourceType: 'opencorporates' };
      session?.setCache(url, page);
      return [page];
    } catch (error: any) {
      const status = error?.response?.status;
      if (status === 403 || status === 429) session?.block('opencorporates', `HTTP ${status}`);
      console.warn(`[PublicSource] Failed opencorporates (${url}): ${error.message}`);
      session?.setCache(url, null);
      return [];
    }
  }
}

export class HotfrogProvider implements PublicSourceProvider {
  name = 'Hotfrog';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('hotfrog')) return [];
    const q = encodeURIComponent(`${ctx.companyName} ${ctx.locality || ctx.postalCode || ''}`.trim());
    const url = `https://www.hotfrog.co.uk/search/gb/${q}`;
    const page = await fetchPublicPage(url, budget, 'hotfrog', ctx.companyName, session);
    return page ? [page] : [];
  }
}

export class ThomsonLocalProvider implements PublicSourceProvider {
  name = 'ThomsonLocal';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('thomsonlocal')) return [];
    const q = encodeURIComponent(`${ctx.companyName} ${ctx.locality || ''}`.trim());
    const url = `https://www.thomsonlocal.com/search/${q}`;
    const page = await fetchPublicPage(url, budget, 'thomsonlocal', ctx.companyName, session);
    return page ? [page] : [];
  }
}

export { CompaniesHouseFilingsProvider } from './ch-filings';
