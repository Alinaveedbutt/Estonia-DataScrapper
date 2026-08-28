const CH_MIN_INTERVAL_MS = 600; // ~100 req/min, well within 600/5min
let lastRequestTime = 0;
let requestQueue: Promise<void> = Promise.resolve();

export async function rateLimitedFetch<T>(fetcher: () => Promise<T>): Promise<T> {
  // Chain requests sequentially with minimum interval
  return new Promise<T>((resolve, reject) => {
    requestQueue = requestQueue.then(async () => {
      const now = Date.now();
      const wait = Math.max(0, lastRequestTime + CH_MIN_INTERVAL_MS - now);
      if (wait > 0) await sleep(wait);
      lastRequestTime = Date.now();

      let lastError: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const result = await fetcher();
          resolve(result);
          return;
        } catch (error: any) {
          lastError = error;
          if (error?.response?.status === 429) {
            const backoff = Math.pow(2, attempt + 1) * 5000; // 10s, 20s, 40s, 80s
            console.warn(`[CH] Rate limited (429). Backing off ${backoff / 1000}s...`);
            await sleep(backoff);
          } else {
            reject(error);
            return;
          }
        }
      }
      reject(lastError || new Error('Rate limit retries exhausted'));
    }).catch(reject);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
