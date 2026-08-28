import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage, PublicSourceProvider } from '../public-sources/types';
import { PublicSourceSession } from '../public-sources/session';
import { config } from '../../config/env';
import {
  buildYolistQueryParams,
  fetchYolistBusinesses,
  fetchYolistBusinessDetail,
  filterYolistByCompanyName,
  yolistBusinessToText,
  isMaskedPhone,
} from './client';

/**
 * Yolist.uk REST API — official UK business directory.
 * Unauthenticated tier: 60 req/min, limited fields (phone may be masked).
 * Optional free API key (YOLOIST_API_KEY) unlocks full fields per Yolist docs.
 * No email field in API schema.
 */
export class YolistProvider implements PublicSourceProvider {
  name = 'Yolist';

  async fetchPages(
    ctx: CompanyContext,
    budget: EnrichmentBudget,
    session?: PublicSourceSession
  ): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('yolist')) return [];
    if (!budget.canFetch()) return [];

    const query = buildYolistQueryParams(ctx);
    if (!query.postcode && !query.city) return [];

    budget.recordFetch();

    try {
      const apiKey = config.yolist.apiKey || undefined;
      const list = await fetchYolistBusinesses(
        { ...query, apiKey },
        Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs)
      );

      const matches = filterYolistByCompanyName(list.businesses, ctx.companyName);
      if (matches.length === 0) {
        return [];
      }

      const pages: PublicSourcePage[] = [];

      for (const match of matches.slice(0, 3)) {
        let record = match;

        if (budget.canFetch() && apiKey && !isMaskedPhone(match.phone)) {
          budget.recordFetch();
          const detail = await fetchYolistBusinessDetail(
            match.id,
            apiKey,
            Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs)
          );
          if (detail) record = detail;
        }

        pages.push({
          url: `https://yolist.uk/business/${record.slug || record.id}`,
          title: record.name,
          text: `${yolistBusinessToText(record)} Company number ${ctx.companyNumber} ${ctx.locality || ''} ${ctx.postalCode || ''}`,
          sourceType: 'yolist',
        });
      }

      return pages;
    } catch (error: any) {
      const msg = error.message || '';
      if (msg.includes('429') || msg.includes('403')) {
        session?.block('yolist', msg);
      }
      console.warn(`[Yolist] Failed for ${ctx.companyNumber}: ${msg}`);
      return [];
    }
  }
}
