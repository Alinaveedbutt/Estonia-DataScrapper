import axios from 'axios';
import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage, PublicSourceProvider } from '../public-sources/types';
import { PublicSourceSession } from '../public-sources/session';

const FSA_API = 'https://api.ratings.food.gov.uk/Establishments';

export interface FsaEstablishment {
  BusinessName: string;
  BusinessType?: string;
  AddressLine1?: string;
  AddressLine2?: string;
  AddressLine3?: string;
  AddressLine4?: string;
  PostCode?: string;
  Phone?: string;
  FHRSID?: number;
}

function cleanSearchName(companyName: string): string {
  return companyName
    .replace(/\b(ltd|limited|llp|plc|inc|uk)\b/gi, '')
    .replace(/[^a-zA-Z0-9\s&'-]/g, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 3)
    .join(' ');
}

function establishmentToText(e: FsaEstablishment, ctx: CompanyContext): string {
  const address = [e.AddressLine1, e.AddressLine2, e.AddressLine3, e.AddressLine4]
    .filter(Boolean)
    .join(', ');
  return [
    e.BusinessName,
    e.BusinessType ? `Type: ${e.BusinessType}` : '',
    address ? `Address: ${address}` : '',
    e.PostCode ? `Postcode: ${e.PostCode}` : '',
    e.Phone ? `Phone: ${e.Phone}` : '',
    `Company number: ${ctx.companyNumber}`,
    ctx.companyName,
    ctx.locality ? `Locality: ${ctx.locality}` : '',
  ]
    .filter(Boolean)
    .join('. ');
}

/**
 * FSA Food Hygiene Ratings API — free, official, no API key.
 * Covers food/cafe/catering businesses only. Phone field exists but is often empty.
 * Useful for name + address verification; occasional phone for food-sector leads.
 */
export class FsaRatingsProvider implements PublicSourceProvider {
  name = 'FsaFoodRatings';

  async fetchPages(
    ctx: CompanyContext,
    budget: EnrichmentBudget,
    session?: PublicSourceSession
  ): Promise<PublicSourcePage[]> {
    if (session?.isBlocked('fsa_ratings')) return [];
    if (!budget.canFetch()) return [];

    const name = cleanSearchName(ctx.companyName);
    if (!name || name.length < 3) return [];

    const postcodeArea = ctx.postalCode?.split(/\s+/)[0]?.toUpperCase();

    budget.recordFetch();
    const timeout = Math.min(budget.config.pageTimeoutMs, budget.remainingCompanyMs);

    try {
      const response = await axios.get(FSA_API, {
        timeout,
        headers: { 'x-api-version': '2', Accept: 'application/json' },
        params: {
          name,
          postcode: postcodeArea,
          pageSize: 10,
          pageNumber: 1,
        },
        validateStatus: (s) => s < 500,
      });

      if (response.status === 429 || response.status === 403) {
        session?.block('fsa_ratings', `HTTP ${response.status}`);
        return [];
      }
      if (response.status !== 200) {
        console.warn(`[FSA] HTTP ${response.status} for ${ctx.companyNumber}`);
        return [];
      }

      const establishments: FsaEstablishment[] = response.data?.establishments ?? [];
      if (establishments.length === 0) return [];

      return establishments.slice(0, 5).map((e) => ({
        url: `https://ratings.food.gov.uk/business/${e.FHRSID}`,
        title: e.BusinessName,
        text: establishmentToText(e, ctx),
        sourceType: 'fsa_ratings',
      }));
    } catch (error: any) {
      console.warn(`[FSA] Failed for ${ctx.companyNumber}: ${error.message}`);
      return [];
    }
  }
}
