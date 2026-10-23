import { buildDomainCandidates } from './domain-probe';

describe('buildDomainCandidates', () => {
  it('prefers .ee domains and strips OÜ', () => {
    const domains = buildDomainCandidates('Kilomotors OÜ');
    expect(domains.some((d) => d.endsWith('.ee'))).toBe(true);
    expect(domains.join(' ')).not.toMatch(/oü/i);
  });

  it('returns empty for tiny names', () => {
    expect(buildDomainCandidates('AB')).toEqual([]);
  });
});
