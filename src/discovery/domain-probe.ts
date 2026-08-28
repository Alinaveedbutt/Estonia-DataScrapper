import axios from 'axios';
import { WebsiteVerifier } from './website-verification';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|inc|uk)\b/gi, '')
    .replace(/[^a-z0-9]+/g, '')
    .substring(0, 40);
}

function buildDomainCandidates(companyName: string): string[] {
  const slug = slugify(companyName);
  if (!slug || slug.length < 3) return [];

  const variants = new Set<string>();
  variants.add(`${slug}.co.uk`);
  variants.add(`${slug}.com`);
  variants.add(`${slug}.uk`);

  const words = companyName
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|inc|uk)\b/gi, '')
    .split(/[\s\-_&,]+/)
    .filter((w) => w.length > 2);

  if (words.length >= 2) {
    variants.add(`${words.join('')}.co.uk`);
    variants.add(`${words[0]}${words[1]}.co.uk`);
  }

  return Array.from(variants);
}

/**
 * Probe plausible domains derived from company name.
 * Used for website detection only — verified before acceptance.
 */
export async function probeDomainsForWebsite(
  companyName: string,
  locality?: string,
  postalCode?: string,
  companyNumber?: string,
  maxProbes = 4,
  timeoutMs = 5000
): Promise<{ url: string; confidence: number } | null> {
  const candidates = buildDomainCandidates(companyName).slice(0, maxProbes);
  if (candidates.length === 0) return null;

  const verifier = new WebsiteVerifier();
  let best: { url: string; confidence: number } | null = null;

  for (const domain of candidates) {
    for (const proto of ['https', 'http']) {
      const url = `${proto}://${domain}`;
      try {
        const response = await axios.get(url, {
          timeout: timeoutMs,
          maxRedirects: 3,
          maxContentLength: 512 * 1024,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: 'text/html',
          },
          validateStatus: (s) => s >= 200 && s < 400,
        });

        if (typeof response.data !== 'string') continue;

        const result = await verifier.verifyWebsite(url, companyName, locality, postalCode, companyNumber);
        if (result.isMatch && (!best || result.confidence > best.confidence)) {
          best = { url, confidence: result.confidence };
        }
        if (best && best.confidence >= 60) return best;
      } catch {
        /* domain does not resolve or unreachable */
      }
    }
  }

  return best;
}
