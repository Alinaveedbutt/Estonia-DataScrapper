import axios from 'axios';
import { format } from 'date-fns';
import { prisma } from '../../database/client';
import { config } from '../../config/env';

const STATE_ID = 'default';

/** Tracks Google CSE queries per UTC day — hard cap well below free tier (100/day). */
export class GoogleCseQuota {
  private dailyCap: number;

  constructor(dailyCap = config.google.cse.dailyCap) {
    this.dailyCap = dailyCap;
  }

  private todayKey(): string {
    return format(new Date(), 'yyyy-MM-dd');
  }

  async getUsage(): Promise<{ date: string; used: number; cap: number; remaining: number }> {
    const state = await prisma.pipelineState.findUnique({ where: { id: STATE_ID } });
    const today = this.todayKey();
    const used =
      state?.google_cse_queries_date === today ? state.google_cse_queries_today : 0;
    return {
      date: today,
      used,
      cap: this.dailyCap,
      remaining: Math.max(0, this.dailyCap - used),
    };
  }

  async canQuery(): Promise<boolean> {
    if (!config.google.cse.enabled) return false;
    const { remaining } = await this.getUsage();
    return remaining > 0;
  }

  async recordQuery(count = 1): Promise<void> {
    const today = this.todayKey();
    const state = await prisma.pipelineState.findUnique({ where: { id: STATE_ID } });

    if (!state) {
      await prisma.pipelineState.create({
        data: {
          id: STATE_ID,
          google_cse_queries_date: today,
          google_cse_queries_today: count,
        },
      });
      return;
    }

    if (state.google_cse_queries_date !== today) {
      await prisma.pipelineState.update({
        where: { id: STATE_ID },
        data: { google_cse_queries_date: today, google_cse_queries_today: count },
      });
    } else {
      await prisma.pipelineState.update({
        where: { id: STATE_ID },
        data: { google_cse_queries_today: { increment: count } },
      });
    }
  }
}

export interface GoogleCseResultItem {
  title: string;
  link: string;
  snippet: string;
}

export async function searchGoogleCse(
  query: string,
  maxResults = 5,
  timeoutMs = 5000
): Promise<GoogleCseResultItem[]> {
  const { apiKey, cx } = config.google.cse;
  if (!apiKey || !cx) return [];

  const response = await axios.get('https://www.googleapis.com/customsearch/v1', {
    params: {
      key: apiKey,
      cx,
      q: query,
      num: Math.min(maxResults, 10),
      gl: 'uk',
      hl: 'en',
    },
    timeout: timeoutMs,
    validateStatus: (s) => s < 500,
  });

  if (response.status === 429 || response.status === 403) {
    throw new Error(`Google CSE quota or access denied (HTTP ${response.status})`);
  }
  if (response.status !== 200) {
    throw new Error(`Google CSE HTTP ${response.status}`);
  }

  const items = response.data?.items || [];
  return items.map((item: any) => ({
    title: item.title || '',
    link: item.link || '',
    snippet: item.snippet || '',
  }));
}
