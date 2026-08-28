import axios from 'axios';
import { FsaRatingsProvider } from './provider';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourceSession } from '../public-sources/session';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FsaRatingsProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns establishment pages with phone when present', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: {
        establishments: [
          {
            FHRSID: 123,
            BusinessName: 'Jalaram Food Ltd',
            PostCode: 'CM20 1YS',
            Phone: '01279 123456',
            AddressLine1: '1 Market Street',
            BusinessType: 'Restaurant/Cafe/Canteen',
          },
        ],
      },
    });

    const provider = new FsaRatingsProvider();
    const budget = new EnrichmentBudget({
      maxSearchRequests: 0,
      maxPageFetches: 1,
      maxCompanyMs: 5000,
      searchTimeoutMs: 4000,
      pageTimeoutMs: 5000,
    });

    const pages = await provider.fetchPages(
      {
        companyName: 'Jalaram Food Ltd',
        companyNumber: '15922785',
        locality: 'Harlow',
        postalCode: 'CM20 1YS',
      },
      budget,
      new PublicSourceSession()
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].sourceType).toBe('fsa_ratings');
    expect(pages[0].text).toContain('01279 123456');
    expect(pages[0].text).toContain('15922785');
  });

  it('returns empty when no establishments found', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 200, data: { establishments: [] } });

    const provider = new FsaRatingsProvider();
    const budget = new EnrichmentBudget({
      maxSearchRequests: 0,
      maxPageFetches: 1,
      maxCompanyMs: 5000,
      searchTimeoutMs: 4000,
      pageTimeoutMs: 5000,
    });

    const pages = await provider.fetchPages(
      { companyName: 'Unknown Corp Ltd', companyNumber: '999', postalCode: 'AB1 2CD' },
      budget,
      new PublicSourceSession()
    );

    expect(pages).toHaveLength(0);
  });
});
