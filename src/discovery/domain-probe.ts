import axios from 'axios';
import { WebsiteVerifier } from './website-verification';

const LEGAL_SUFFIXES =
  /\b(oü|ou|osaühing|as|aktsiaselts|tü|tu|tulundusühistu|mtü|mtu|mittetulundusühing|fie|uü|uu)\b/gi;

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[^a-z0-9]+/g, '')
    .substring(0, 40);
}

export function buildDomainCandidates(companyName: string): string[] {
  const slug = slugify(companyName);
  if (!slug || slug.length < 3) return [];

  const variants = new Set<string>();
  variants.add(`${slug}.ee`);
  variants.add(`${slug}.com`);
  variants.add(`${slug}.eu`);

  const words = companyName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(LEGAL_SUFFIXES, '')
    .split(/[\s\-_&,]+/)
    .filter((w) => w.length > 2 && !/^(and|the|ou|as)$/i.test(w));

  if (words.length >= 2) {
    variants.add(`${words.join('')}.ee`);
    variants.add(`${words[0]}${words[1]}.ee`);
  }

  return Array.from(variants);
}

/**
 * Probe plausible .ee/.com/.eu domains derived from company name.
 */
export async function probeDomainsForWebsite(
  companyName: string,
  locality?: string,
  postalCode?: string,
  registryCode?: string,
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
            'User-Agent': 'Mozilla/5.0 (compatible; EstoniaCompanyPipeline/1.0)',
            Accept: 'text/html',
          },
          validateStatus: (s) => s >= 200 && s < 400,
        });

        if (typeof response.data !== 'string') continue;

        const result = await verifier.verifyWebsite(
          url,
          companyName,
          locality,
          postalCode,
          registryCode
        );
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
