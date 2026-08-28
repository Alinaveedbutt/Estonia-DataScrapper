import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage, PublicSourceProvider } from '../public-sources/types';
import { PublicSourceSession } from '../public-sources/session';
import { config } from '../../config/env';
import { GoogleCseQuota, searchGoogleCse } from './client';
import { EnrichmentSession } from '../enrichment-session';

function buildQueries(ctx: CompanyContext): string[] {
  const pcArea = ctx.postalCode?.split(/\s+/)[0] || ctx.locality || 'UK';
  return [
    `"${ctx.companyName}" ${pcArea} contact phone email`,
    `"${ctx.companyName}" "${ctx.companyNumber}" UK contact`,
  ];
}

/** Official Google Custom Search JSON API — optional, quota-capped. */
export class GoogleCseProvider implements PublicSourceProvider {
  name = 'GoogleCSE';
  private quota = new GoogleCseQuota();

  constructor(private enrichmentSession?: EnrichmentSession) {}

  async fetchPages(
    ctx: CompanyContext,
    budget: EnrichmentBudget,
    _session?: PublicSourceSession
  ): Promise<PublicSourcePage[]> {
    if (!config.google.cse.enabled) return [];
    if (!(await this.quota.canQuery())) {
      console.warn('[GoogleCSE] Daily query cap reached — skipping');
      return [];
    }

    const pages: PublicSourcePage[] = [];
    const queries = buildQueries(ctx).slice(0, config.google.cse.maxQueriesPerCompany);

    for (const query of queries) {
      if (!(await this.quota.canQuery()) || budget.isExpired()) break;

      try {
        const results = await searchGoogleCse(
          query,
          5,
          Math.min(budget.config.searchTimeoutMs, budget.remainingCompanyMs)
        );
        await this.quota.recordQuery(1);

        for (const item of results) {
          pages.push({
            url: item.link,
            title: item.title,
            text: `${item.title} ${item.snippet} ${ctx.companyName} ${ctx.companyNumber}`,
            sourceType: 'google_cse',
          });
        }
      } catch (error: any) {
        console.warn(`[GoogleCSE] Query failed: ${error.message}`);
        budget.disableSearch(error.message);
        break;
      }
    }

    return pages;
  }
}

export { GoogleCseQuota };
