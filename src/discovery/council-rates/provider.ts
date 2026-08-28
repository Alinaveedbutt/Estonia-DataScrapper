import axios from 'axios';
import { CompanyContext } from '../../contacts/contact-verifier';
import { EnrichmentBudget } from '../../enrichment/budget';
import { PublicSourcePage, PublicSourceProvider } from '../public-sources/types';
import { PublicSourceSession } from '../public-sources/session';
import { EnrichmentSession } from '../enrichment-session';

export interface CouncilRatesConfig {
  id: string;
  name: string;
  /** Outward postcode prefixes e.g. CM20, CM16 */
  postcodePrefixes: string[];
  csvUrl: string;
  /** Column header substrings (case-insensitive) for ratepayer / business name */
  nameColumns: string[];
  addressColumns: string[];
  postcodeColumns: string[];
}

/** Councils with verified open CSV endpoints (probed live). Expand modularly. */
export const COUNCIL_REGISTRY: CouncilRatesConfig[] = [
  {
    id: 'harlow',
    name: 'Harlow Council',
    postcodePrefixes: ['CM16', 'CM17', 'CM18', 'CM19', 'CM20'],
    csvUrl:
      'https://www.harlow.gov.uk/sites/default/files/documents/Business%20rates%20account%20-%20August%202026.csv',
    nameColumns: ['account name', 'ratepayer', 'organisation', 'business name', 'firm'],
    addressColumns: ['address', 'property address', 'full address'],
    postcodeColumns: ['postcode', 'post code'],
  },
  {
    id: 'leeds',
    name: 'Leeds City Council',
    postcodePrefixes: ['LS1', 'LS2', 'LS3', 'LS4', 'LS5', 'LS6', 'LS7', 'LS8', 'LS9', 'LS10', 'LS11', 'LS12', 'LS13', 'LS14', 'LS15', 'LS16', 'LS17', 'LS18', 'LS19', 'LS20', 'LS21', 'LS22', 'LS23', 'LS24', 'LS25', 'LS26', 'LS27', 'LS28', 'LS29'],
    csvUrl:
      'https://datamillnorth.org/download/business-rates/20e8f8e6-4316-4789-a9eb-25da04f024ad/Data%20Mill%2003-11-2021-with-coordinates.csv',
    nameColumns: ['ratepayer', 'account name', 'organisation name', 'business name'],
    addressColumns: ['address', 'property address'],
    postcodeColumns: ['postcode', 'post code'],
  },
];

const csvCache = new Map<string, { fetchedAt: number; rows: Record<string, string>[] }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePostcode(pc?: string): string {
  return (pc || '').replace(/\s+/g, '').toUpperCase();
}

function outwardCode(pc?: string): string | null {
  if (!pc) return null;
  const n = normalizePostcode(pc);
  const m = n.match(/^([A-Z]{1,2}\d{1,2}[A-Z]?)/);
  return m ? m[1] : null;
}

export function resolveCouncil(postalCode?: string): CouncilRatesConfig | null {
  const outward = outwardCode(postalCode);
  if (!outward) return null;

  for (const council of COUNCIL_REGISTRY) {
    if (council.postcodePrefixes.some((p) => outward.startsWith(p) || outward === p)) {
      return council;
    }
  }
  return null;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function findColumnKey(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase());
  for (const cand of candidates) {
    const idx = lower.findIndex((h) => h.includes(cand));
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/\b(ltd|limited|llp|plc|inc|uk)\b/gi, '')
    .split(/[\s\-_&,]+/)
    .filter((t) => t.length > 2);
}

async function loadCouncilCsv(council: CouncilRatesConfig): Promise<Record<string, string>[]> {
  const cached = csvCache.get(council.id);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rows;
  }

  const response = await axios.get(council.csvUrl, {
    timeout: 30000,
    maxContentLength: 15 * 1024 * 1024,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
  });

  const text = typeof response.data === 'string' ? response.data : String(response.data);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/^"|"$/g, ''));
  const rows: Record<string, string>[] = [];

  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line).map((c) => c.replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] || '';
    });
    rows.push(row);
  }

  csvCache.set(council.id, { fetchedAt: Date.now(), rows });
  return rows;
}

function findRatepayerMatch(
  council: CouncilRatesConfig,
  rows: Record<string, string>[],
  ctx: CompanyContext
): { ratepayer: string; address: string; postcode: string } | null {
  if (rows.length === 0) return null;

  const headers = Object.keys(rows[0]);
  const nameKey = findColumnKey(headers, council.nameColumns);
  const addrKey = findColumnKey(headers, council.addressColumns);
  const pcKey = findColumnKey(headers, council.postcodeColumns);
  if (!nameKey) return null;

  const tokens = nameTokens(ctx.companyName);
  if (tokens.length === 0) return null;

  const targetPc = normalizePostcode(ctx.postalCode);

  let best: { ratepayer: string; address: string; postcode: string; score: number } | null = null;

  for (const row of rows) {
    const ratepayer = row[nameKey] || '';
    if (!ratepayer) continue;

    const rpLower = ratepayer.toLowerCase();
    const matched = tokens.filter((t) => rpLower.includes(t));
    if (matched.length === 0) continue;

    const score = matched.length / tokens.length;
    if (score < 0.5 && matched.length < 2) continue;

    const address = addrKey ? row[addrKey] || '' : '';
    const postcode = pcKey ? row[pcKey] || '' : '';

    if (targetPc && postcode && normalizePostcode(postcode) !== targetPc) {
      const outwardTarget = outwardCode(ctx.postalCode);
      const outwardRow = outwardCode(postcode);
      if (outwardTarget && outwardRow && outwardTarget !== outwardRow) continue;
    }

    if (!best || score > best.score) {
      best = { ratepayer, address, postcode, score };
    }
  }

  return best ? { ratepayer: best.ratepayer, address: best.address, postcode: best.postcode } : null;
}

/**
 * Council non-domestic rates open data — identity/trading-address verification signal.
 * Does not provide phone/email directly.
 */
export class CouncilRatesProvider implements PublicSourceProvider {
  name = 'CouncilRates';

  constructor(private enrichmentSession?: EnrichmentSession) {}

  async fetchPages(
    ctx: CompanyContext,
    budget: EnrichmentBudget,
    _session?: PublicSourceSession
  ): Promise<PublicSourcePage[]> {
    const council = resolveCouncil(ctx.postalCode);
    if (!council) return [];

    if (!budget.canFetch()) return [];
    budget.recordFetch();

    try {
      const rows = await loadCouncilCsv(council);
      this.enrichmentSession?.recordCouncilAvailable(council.name);

      const match = findRatepayerMatch(council, rows, ctx);
      if (!match) return [];

      const tradingAddress = [match.address, match.postcode].filter(Boolean).join(', ');
      this.enrichmentSession?.recordCouncilMatch(tradingAddress);

      const text = [
        `Council Business Rates Register: ${council.name}`,
        `Ratepayer: ${match.ratepayer}`,
        `Trading address: ${tradingAddress}`,
        `Company name: ${ctx.companyName}`,
        `Company number: ${ctx.companyNumber}`,
        ctx.locality ? `Locality: ${ctx.locality}` : '',
        ctx.postalCode ? `Postcode: ${ctx.postalCode}` : '',
      ]
        .filter(Boolean)
        .join('. ');

      return [
        {
          url: council.csvUrl,
          title: `${match.ratepayer} — ${council.name} Business Rates`,
          text,
          sourceType: 'council_business_rates',
        },
      ];
    } catch (error: any) {
      console.warn(`[CouncilRates] ${council.name} failed: ${error.message}`);
      this.enrichmentSession?.recordProviderError(this.name, error.message);
      return [];
    }
  }
}
