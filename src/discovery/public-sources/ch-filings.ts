import axios from 'axios';
import { config } from '../../config/env';
import { rateLimitedFetch } from '../../companies-house/rate-limiter';
import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage, PublicSourceProvider } from './types';
import { PublicSourceSession } from './session';

const BASE_URL = 'https://api.company-information.service.gov.uk';

/** Companies House filing history via official API (free, authenticated). */
export class CompaniesHouseFilingsProvider implements PublicSourceProvider {
  name = 'CompaniesHouseFilings';

  async fetchPages(ctx: CompanyContext, budget: EnrichmentBudget, _session?: PublicSourceSession): Promise<PublicSourcePage[]> {
    if (!budget.canFetch()) return [];
    budget.recordFetch();

    try {
      const response = await rateLimitedFetch(() =>
        axios.get(`${BASE_URL}/company/${ctx.companyNumber}/filing-history`, {
          auth: { username: config.companiesHouse.apiKey, password: '' },
          timeout: Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs),
          params: { items_per_page: 10 },
          validateStatus: (s) => s < 500,
        })
      );

      if (response.status !== 200) return [];

      const items = response.data?.items || [];
      const textParts: string[] = [];
      for (const item of items) {
        if (item.description) textParts.push(item.description);
        if (item.type) textParts.push(item.type);
        if (item.category) textParts.push(item.category);
      }

      const text = textParts.join(' ');
      if (!text.trim()) return [];

      return [
        {
          url: `${BASE_URL}/company/${ctx.companyNumber}/filing-history`,
          title: `${ctx.companyName} — CH Filings`,
          text,
          sourceType: 'companies_house_filings',
        },
      ];
    } catch (error: any) {
      console.warn(`[PublicSource] CH filings failed for ${ctx.companyNumber}: ${error.message}`);
      return [];
    }
  }
}
