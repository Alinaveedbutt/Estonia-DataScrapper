import { NoWebsiteEnrichment } from './no-website-enrichment';
import { PublicSourceProvider } from './public-sources';
import { CompanyContext } from '../contacts/contact-verifier';

const mockDirectoryProvider: PublicSourceProvider = {
  name: 'MockDirectory',
  async fetchPages(ctx: CompanyContext) {
    return [
      {
        url: 'https://www.yell.com/biz/beta-services',
        title: 'Beta Services Ltd Manchester',
        text: 'Beta Services Ltd company number 12345670 Manchester M2 phone 0161 123 4567 email info@betaservices.co.uk',
        sourceType: 'mock_directory',
      },
    ];
  },
};

describe('NoWebsiteEnrichment', () => {
  it('finds verified phone and email independently via direct public sources', async () => {
    const enricher = new NoWebsiteEnrichment(null, { maxCompanyMs: 10000 }, [mockDirectoryProvider]);
    const result = await enricher.enrich({
      companyName: 'Beta Services Ltd',
      companyNumber: '12345670',
      locality: 'Manchester',
      postalCode: 'M2 2BB',
    });

    expect(result.phone).not.toBeNull();
    expect(result.email).not.toBeNull();
    expect(result.phone?.sourceType).toBe('mock_directory');
  });

  it('returns null contacts when verification fails', async () => {
    const badProvider: PublicSourceProvider = {
      name: 'Bad',
      async fetchPages() {
        return [
          {
            url: 'https://yell.com/other',
            title: 'Unrelated',
            text: 'Random business phone 020 7946 0000 email other@other.co.uk',
            sourceType: 'mock',
          },
        ];
      },
    };

    const enricher = new NoWebsiteEnrichment(null, { maxCompanyMs: 5000 }, [badProvider]);
    const result = await enricher.enrich({
      companyName: 'Unique Zeta Holdings Ltd',
      companyNumber: '99999999',
      locality: 'Leeds',
    });

    expect(result.phone).toBeNull();
    expect(result.email).toBeNull();
  });

  it('does not use search when maxSearchRequests is 0', async () => {
    const searchSpy = jest.fn().mockRejectedValue(new Error('should not be called'));
    const enricher = new NoWebsiteEnrichment(
      { name: 'Spy', search: searchSpy },
      { maxSearchRequests: 0, maxCompanyMs: 5000 },
      [mockDirectoryProvider]
    );

    await enricher.enrich({
      companyName: 'Beta Services Ltd',
      companyNumber: '12345670',
      locality: 'Manchester',
    });

    expect(searchSpy).not.toHaveBeenCalled();
  });
});

describe('EnrichmentBudget', () => {
  it('stops search after budget exhausted', async () => {
    const { EnrichmentBudget } = await import('../enrichment/budget');
    const budget = new EnrichmentBudget({
      maxSearchRequests: 1,
      maxPageFetches: 2,
      maxCompanyMs: 5000,
      searchTimeoutMs: 1000,
      pageTimeoutMs: 1000,
    });

    expect(budget.canSearch()).toBe(true);
    budget.recordSearch();
    expect(budget.canSearch()).toBe(false);
    budget.disableSearch('timeout');
    expect(budget.canSearch()).toBe(false);
  });
});
