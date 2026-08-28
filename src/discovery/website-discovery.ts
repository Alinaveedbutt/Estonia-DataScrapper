import { WebsiteVerifier } from './website-verification';
import { probeDomainsForWebsite } from './domain-probe';
import {
  CompaniesHousePageProvider,
  OpenCorporatesProvider,
  EndoleProvider,
  PublicSourcePage,
} from './public-sources';
import { PublicSourceSession } from './public-sources/session';
import { SearchProvider } from './search-provider';
import { EnrichmentBudget } from '../enrichment/budget';
import { config } from '../config/env';

export interface DiscoveryResult {
  website: string | null;
  confidence: number;
  source: string | null;
}

const SOCIAL_OR_DIRECTORY = [
  'facebook.com',
  'linkedin.com',
  'twitter.com',
  'instagram.com',
  'yell.com',
  '192.com',
  'endole.co.uk',
  'opencorporates.com',
  'companieshouse.gov.uk',
  'gov.uk',
  'freeindex.co.uk',
  'cylex-uk.co.uk',
  'hotfrog.co.uk',
  'thomsonlocal.com',
];

function extractWebsiteCandidates(pages: PublicSourcePage[]): string[] {
  const urls = new Set<string>();

  for (const page of pages) {
    const domainMatches = page.text.match(/https?:\/\/[a-z0-9][a-z0-9.-]+\.[a-z]{2,}/gi) || [];
    for (const match of domainMatches) {
      try {
        const host = new URL(match).hostname.replace(/^www\./, '').toLowerCase();
        if (!SOCIAL_OR_DIRECTORY.some((d) => host.includes(d))) {
          urls.add(new URL(match).origin);
        }
      } catch {
        /* ignore */
      }
    }
  }

  return Array.from(urls);
}

/**
 * Website discovery: CH page → OpenCorporates → domain probing → optional search.
 * Used to decide whether to discard (has website) or keep as lead (no website).
 */
export class WebsiteDiscovery {
  private verifier = new WebsiteVerifier();
  private chPage = new CompaniesHousePageProvider();
  private openCorporates = new OpenCorporatesProvider();
  private endole = new EndoleProvider();
  private searchProvider: SearchProvider | null;

  constructor(searchProvider?: SearchProvider | null) {
    this.searchProvider = searchProvider ?? null;
  }

  public async discover(
    companyName: string,
    locality?: string,
    postalCode?: string,
    companyNumber?: string,
    session?: PublicSourceSession
  ): Promise<DiscoveryResult> {
    const budget = new EnrichmentBudget({
      maxSearchRequests: config.app.websiteMaxSearchRequests,
      maxPageFetches: 4,
      maxCompanyMs: config.app.websiteCompanyTimeoutMs,
      searchTimeoutMs: config.app.websiteSearchTimeoutMs,
      pageTimeoutMs: config.app.websitePageTimeoutMs,
    });

    const candidateUrls = new Set<string>();
    const ctx = { companyName, companyNumber: companyNumber || '', locality, postalCode };
    const collectedPages: PublicSourcePage[] = [];

    if (companyNumber) {
      for (const provider of [this.chPage, this.openCorporates, this.endole]) {
        if (budget.isExpired()) break;
        const pages = await provider.fetchPages(ctx, budget, session);
        collectedPages.push(...pages);
      }

      for (const url of extractWebsiteCandidates(collectedPages)) {
        candidateUrls.add(url);
      }
    }

    if (!budget.isExpired()) {
      const probed = await probeDomainsForWebsite(
        companyName,
        locality,
        postalCode,
        companyNumber,
        4,
        Math.min(5000, budget.remainingCompanyMs)
      );
      if (probed) candidateUrls.add(probed.url);
    }

    if (this.searchProvider && budget.canSearch()) {
      budget.recordSearch();
      try {
        const query = `"${companyName}" official website UK`;
        const results = await this.searchProvider.search(query, 3);
        for (const res of results) {
          try {
            const urlStr = res.url.startsWith('http') ? res.url : `https://${res.url}`;
            const origin = new URL(urlStr).origin;
            if (!SOCIAL_OR_DIRECTORY.some((d) => origin.includes(d))) {
              candidateUrls.add(origin);
            }
          } catch {
            /* ignore */
          }
        }
      } catch (error: any) {
        console.warn(`[WebsiteDiscovery] Optional search skipped: ${error.message}`);
        budget.disableSearch(error.message);
      }
    }

    let bestMatch: { url: string; confidence: number; source: string } | null = null;

    for (const url of candidateUrls) {
      if (budget.isExpired()) break;
      const result = await this.verifier.verifyWebsite(url, companyName, locality, postalCode, companyNumber);
      if (result.isMatch && (!bestMatch || result.confidence > bestMatch.confidence)) {
        bestMatch = {
          url,
          confidence: result.confidence,
          source: url.includes(companyNumber || '___') ? 'public_source' : 'domain_probe',
        };
      }
    }

    if (bestMatch) {
      return {
        website: bestMatch.url,
        confidence: bestMatch.confidence,
        source: bestMatch.source,
      };
    }

    return { website: null, confidence: 0, source: null };
  }
}
