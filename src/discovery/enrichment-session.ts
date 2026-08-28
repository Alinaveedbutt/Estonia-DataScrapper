/** Per-company enrichment diagnostics shared across providers during one enrich() call. */
export class EnrichmentSession {
  councilDataAvailable = false;
  councilMatchFound = false;
  councilName: string | null = null;
  councilTradingAddress: string | null = null;
  hadProviderError = false;
  providerErrors: string[] = [];

  recordCouncilAvailable(councilName: string) {
    this.councilDataAvailable = true;
    this.councilName = councilName;
  }

  recordCouncilMatch(tradingAddress: string) {
    this.councilMatchFound = true;
    this.councilTradingAddress = tradingAddress;
  }

  recordProviderError(provider: string, message: string) {
    this.hadProviderError = true;
    this.providerErrors.push(`${provider}: ${message}`);
  }
}
