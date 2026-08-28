import { WebsiteVerifier } from './website-verification';

describe('WebsiteVerifier', () => {
  const verifier = new WebsiteVerifier();

  it('rejects known directory domains without fetching', async () => {
    const result = await verifier.verifyWebsite(
      'https://www.yell.com/biz/test',
      'Test Company Ltd',
      'London'
    );
    expect(result.isMatch).toBe(false);
    expect(result.reasons).toContain('Known directory/social site');
  });
});
