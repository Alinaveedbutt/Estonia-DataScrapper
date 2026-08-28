export interface EnrichmentBudgetConfig {
  maxSearchRequests: number;
  maxPageFetches: number;
  maxCompanyMs: number;
  searchTimeoutMs: number;
  pageTimeoutMs: number;
}

export class EnrichmentBudget {
  private searchUsed = 0;
  private fetchesUsed = 0;
  private readonly companyStart: number;
  public searchDisabled = false;

  constructor(public readonly config: EnrichmentBudgetConfig) {
    this.companyStart = Date.now();
  }

  get remainingCompanyMs(): number {
    return Math.max(0, this.config.maxCompanyMs - (Date.now() - this.companyStart));
  }

  isExpired(): boolean {
    return this.remainingCompanyMs <= 0;
  }

  canSearch(): boolean {
    return !this.searchDisabled && !this.isExpired() && this.searchUsed < this.config.maxSearchRequests;
  }

  canFetch(): boolean {
    return !this.isExpired() && this.fetchesUsed < this.config.maxPageFetches;
  }

  recordSearch(): void {
    this.searchUsed++;
  }

  recordFetch(): void {
    this.fetchesUsed++;
  }

  disableSearch(reason: string): void {
    this.searchDisabled = true;
    console.warn(`[Budget] Search disabled for this company: ${reason}`);
  }
}
