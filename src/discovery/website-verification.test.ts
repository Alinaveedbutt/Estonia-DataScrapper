import { WebsiteVerifier } from './website-verification';

describe('WebsiteVerifier', () => {
  const verifier = new WebsiteVerifier();

  it('rejects known directory domains without fetching', async () => {
    const result = await verifier.verifyWebsite(
      'https://ariregister.rik.ee/eng/company/123',
      'Test Company OÜ'
    );
    expect(result.isMatch).toBe(false);
    expect(result.reasons[0]).toMatch(/directory/i);
  });
});
