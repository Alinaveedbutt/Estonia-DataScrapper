import axios from 'axios';
import { YolistProvider } from './provider';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourceSession } from '../public-sources/session';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YolistProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns matched business pages with phone and address', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: {
        businesses: [
          {
            id: 'abc',
            name: 'Beta Services Ltd',
            slug: 'beta-services-manchester',
            phone: '0161 496 0000',
            website: 'https://beta.example',
            city: 'Manchester',
          },
          { id: 'xyz', name: 'Other Co', phone: '020 7000 0000' },
        ],
        total: 2,
        page: 1,
        pages: 1,
      },
    });

    const provider = new YolistProvider();
    const budget = new EnrichmentBudget({
      maxSearchRequests: 0,
      maxPageFetches: 2,
      maxCompanyMs: 10000,
      searchTimeoutMs: 4000,
      pageTimeoutMs: 5000,
    });

    const pages = await provider.fetchPages(
      {
        companyName: 'Beta Services Ltd',
        companyNumber: '12345670',
        locality: 'Manchester',
        postalCode: 'M1 1AA',
      },
      budget,
      new PublicSourceSession()
    );

    expect(pages).toHaveLength(1);
    expect(pages[0].sourceType).toBe('yolist');
    expect(pages[0].text).toContain('0161 496 0000');
    expect(pages[0].text).toContain('12345670');
  });

  it('blocks provider on HTTP 429', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('HTTP 429'));

    const session = new PublicSourceSession();
    const provider = new YolistProvider();
    const budget = new EnrichmentBudget({
      maxSearchRequests: 0,
      maxPageFetches: 1,
      maxCompanyMs: 5000,
      searchTimeoutMs: 4000,
      pageTimeoutMs: 5000,
    });

    const pages = await provider.fetchPages(
      { companyName: 'Test Ltd', companyNumber: '1', postalCode: 'M1 1AA' },
      budget,
      session
    );

    expect(pages).toHaveLength(0);
    expect(session.isBlocked('yolist')).toBe(true);
  });
});
