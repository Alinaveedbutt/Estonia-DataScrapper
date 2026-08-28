import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { SearchProvider } from '../search-provider';
import { fetchPublicPage } from './fetch';
import { PublicSourcePage, PublicSourceProvider } from './types';
import { PublicSourceSession } from './session';

export class FreeIndexProvider implements PublicSourceProvider {
  name = 'FreeIndex';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('freeindex')) return [];
    const name = encodeURIComponent(ctx.companyName);
    const geo = encodeURIComponent(ctx.locality || ctx.postalCode || 'UK');
    const url = `https://www.freeindex.co.uk/searchresults.htm?search=${name}&geo=${geo}`;
    const page = await fetchPublicPage(url, budget, 'freeindex', ctx.companyName, session);
    return page ? [page] : [];
  }
}

export class CylexSearchProvider implements PublicSourceProvider {
  name = 'CylexSearch';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('cylex_search')) return [];
    const q = encodeURIComponent(`${ctx.companyName} ${ctx.locality || ''}`.trim());
    const url = `https://www.cylex-uk.co.uk/search?q=${q}`;
    const page = await fetchPublicPage(url, budget, 'cylex_search', ctx.companyName, session);
    return page ? [page] : [];
  }
}

export class EndoleProvider implements PublicSourceProvider {
  name = 'Endole';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('endole')) return [];
    const url = `https://open.endole.co.uk/insight/company/${ctx.companyNumber}`;
    const page = await fetchPublicPage(url, budget, 'endole', ctx.companyName, session);
    return page ? [page] : [];
  }
}

export class SearchResultProvider implements PublicSourceProvider {
  name = 'SearchProvider';

  constructor(
    private searchProvider: SearchProvider,
    private maxQueries: number
  ) {}

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget): Promise<PublicSourcePage[]> {
    if (!budget.canSearch()) return [];

    const queries = [
      `"${ctx.companyName}" "${ctx.companyNumber}" phone contact UK`,
      `"${ctx.companyName}" "${ctx.locality || 'UK'}" email contact`,
    ].slice(0, this.maxQueries);

    const pages: PublicSourcePage[] = [];

    for (const query of queries) {
      if (!budget.canSearch() || budget.isExpired()) break;

      budget.recordSearch();
      try {
        const results = await this.searchProvider.search(query, 3, budget.config.searchTimeoutMs);
        for (const result of results) {
          pages.push({
            url: result.url,
            title: result.title,
            text: `${result.title} ${result.snippet}`,
            sourceType: `search_${this.searchProvider.name.toLowerCase()}`,
          });
        }
      } catch (error: any) {
        console.warn(`[Search] ${this.searchProvider.name} failed: ${error.message}`);
        budget.disableSearch(error.message);
        break;
      }
    }

    return pages;
  }
}
