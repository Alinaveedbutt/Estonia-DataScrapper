import { PublicSourcePage } from './index';

/**
 * Per-run session cache and fail-fast blocklist for public source fetches.
 * Prevents duplicate fetches and repeated 403/timeout waste.
 */
export class PublicSourceSession {
  private cache = new Map<string, PublicSourcePage | null>();
  private blockedTypes = new Set<string>();

  hasCache(url: string): boolean {
    return this.cache.has(url);
  }

  getCache(url: string): PublicSourcePage | null | undefined {
    return this.cache.get(url);
  }

  setCache(url: string, page: PublicSourcePage | null): void {
    this.cache.set(url, page);
  }

  isBlocked(sourceType: string): boolean {
    return this.blockedTypes.has(sourceType);
  }

  block(sourceType: string, reason: string): void {
    if (!this.blockedTypes.has(sourceType)) {
      this.blockedTypes.add(sourceType);
      console.warn(`[PublicSource] Blocking ${sourceType} for remainder of run: ${reason}`);
    }
  }
}

export const globalPublicSourceSession = new PublicSourceSession();
