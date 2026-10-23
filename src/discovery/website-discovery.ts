import { config } from '../config/env';
import { RawEstoniaCompany, registryWebsite } from '../estonia/mapper';
import { probeDomainsForWebsite } from './domain-probe';

export interface DiscoveryResult {
  website: string | null;
  confidence: number;
  source: string | null;
  status: 'WEBSITE_EXISTS' | 'NO_WEBSITE';
}

export interface DiscoverOptions {
  probeEnabled?: boolean;
}

/**
 * Website detection for Estonian companies:
 * 1) Official WWW from register contacts
 * 2) Optional domain probe (.ee / .com / .eu)
 */
export async function discoverWebsite(
  raw: RawEstoniaCompany,
  options: DiscoverOptions = {}
): Promise<DiscoveryResult> {
  const fromRegister = registryWebsite(raw);
  if (fromRegister) {
    return {
      website: fromRegister,
      confidence: 95,
      source: 'e-Business Register (WWW)',
      status: 'WEBSITE_EXISTS',
    };
  }

  const probeEnabled = options.probeEnabled ?? config.app.websiteProbeEnabled;
  if (!probeEnabled) {
    return { website: null, confidence: 0, source: null, status: 'NO_WEBSITE' };
  }

  const y = raw.yldandmed;
  const addr = (y?.aadressid || []).find((a) => !a.lopp_kpv) || y?.aadressid?.[0];
  const probed = await probeDomainsForWebsite(
    String(raw.nimi || ''),
    addr?.ehak_nimetus || undefined,
    addr?.postiindeks || undefined,
    String(raw.ariregistri_kood || ''),
    config.app.websiteMaxProbes,
    config.app.websitePageTimeoutMs
  );

  if (probed) {
    return {
      website: probed.url,
      confidence: probed.confidence,
      source: 'domain_probe',
      status: 'WEBSITE_EXISTS',
    };
  }

  return { website: null, confidence: 0, source: null, status: 'NO_WEBSITE' };
}
