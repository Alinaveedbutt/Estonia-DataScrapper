import axios from 'axios';
import * as cheerio from 'cheerio';

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  name: string;
  search(query: string, maxResults?: number, timeoutMs?: number): Promise<SearchResult[]>;
}

export interface SearchProviderOptions {
  timeoutMs?: number;
  throttleMs?: number;
}

/**
 * Wraps any SearchProvider with strict timeout. No retries.
 */
export class BudgetedSearchProvider implements SearchProvider {
  name: string;

  constructor(
    private inner: SearchProvider,
    private options: SearchProviderOptions = {}
  ) {
    this.name = `Budgeted(${inner.name})`;
  }

  async search(query: string, maxResults = 5, timeoutMs?: number): Promise<SearchResult[]> {
    const effectiveTimeout = timeoutMs ?? this.options.timeoutMs ?? 4000;
    const throttleMs = this.options.throttleMs ?? 0;

    if (throttleMs > 0) {
      await new Promise((r) => setTimeout(r, throttleMs));
    }

    return this.inner.search(query, maxResults, effectiveTimeout);
  }
}

/**
 * DuckDuckGo HTML search — optional, not required by the pipeline.
 * Short timeout, no fallback data, throws on failure (fail-fast).
 */
export class DuckDuckGoSearchProvider implements SearchProvider {
  name = 'DuckDuckGo';

  async search(query: string, maxResults = 5, timeoutMs = 4000): Promise<SearchResult[]> {
    try {
      const response = await axios.post(
        'https://lite.duckduckgo.com/lite/',
        `q=${encodeURIComponent(query)}`,
        {
          timeout: timeoutMs,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
        }
      );

      const $ = cheerio.load(response.data);
      const results: SearchResult[] = [];

      $('tr').each((_, el) => {
        if (results.length >= maxResults) return false;

        const titleEl = $(el).find('.result-snippet');
        if (titleEl.length > 0) {
          const snippet = titleEl.text().trim();
          const prevRow = $(el).prev('tr');
          const aTag = prevRow.find('.result-title');
          const title = aTag.text().trim();
          let url = aTag.attr('href') || '';

          if (url.includes('uddg=')) {
            try {
              url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
            } catch {
              /* ignore */
            }
          }

          if (title && url && url.startsWith('http')) {
            results.push({ title, url, snippet });
          }
        }
      });

      return results;
    } catch (error: any) {
      const reason = error.code === 'ECONNABORTED' ? 'timeout' : error.message;
      console.warn(`[Search] DuckDuckGo ${reason} (${timeoutMs}ms) for query: ${query.substring(0, 60)}`);
      throw error;
    }
  }
}
