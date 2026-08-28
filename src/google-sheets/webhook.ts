import axios from 'axios';
import { config } from '../config/env';

/**
 * Google Apps Script Webhook Client
 * 
 * Replaces the Google Sheets service-account approach with a free
 * Google Apps Script Web App endpoint. No Google Cloud billing required.
 * 
 * The Apps Script validates a shared secret before writing.
 */
export class GoogleSheetsWebhook {
  private url: string;
  private secret: string;

  constructor() {
    this.url = config.google.webhookUrl;
    this.secret = config.google.webhookSecret;
  }

  public isConfigured(): boolean {
    return !!(this.url && this.secret);
  }

  private async post(payload: any): Promise<any> {
    if (!this.isConfigured()) {
      console.warn('[GS-Webhook] Not configured. Skipping.');
      return null;
    }

    let lastError: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await axios.post(this.url, payload, {
          timeout: 30000,
          headers: { 'Content-Type': 'application/json' },
          // Google Apps Script redirects POST to GET on 302 — follow it
          maxRedirects: 5,
          validateStatus: (s) => s >= 200 && s < 400,
        });

        const data = typeof response.data === 'string' 
          ? JSON.parse(response.data) 
          : response.data;

        if (data?.success === false) {
          throw new Error(`Apps Script error: ${data.error || 'unknown'}`);
        }

        return data;
      } catch (error: any) {
        lastError = error;
        if (error?.response?.status === 429 || error?.code === 'ECONNRESET') {
          const backoff = Math.pow(2, attempt + 1) * 3000;
          console.warn(`[GS-Webhook] Rate limited/connection error. Retrying in ${backoff / 1000}s...`);
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          throw error;
        }
      }
    }
    throw lastError || new Error('Webhook retries exhausted');
  }

  public async syncCompanies(companies: any[]): Promise<void> {
    if (companies.length === 0) return;

    // Batch in groups of 50 to stay within Apps Script execution limits
    const batchSize = 50;
    for (let i = 0; i < companies.length; i += batchSize) {
      const batch = companies.slice(i, i + batchSize);
      try {
        const result = await this.post({
          secret: this.secret,
          action: 'sync_companies',
          companies: batch,
        });
        if (result) {
          console.log(`[GS-Webhook] Synced batch: ${result.inserted || 0} inserted, ${result.updated || 0} updated`);
        }
      } catch (error: any) {
        console.error(`[GS-Webhook] Company sync error: ${error.message}`);
      }
    }
  }

  public async syncLogs(logs: any[]): Promise<void> {
    if (logs.length === 0) return;
    try {
      const result = await this.post({
        secret: this.secret,
        action: 'sync_logs',
        logs: logs.slice(0, 200), // limit to most recent 200
      });
      if (result) {
        console.log(`[GS-Webhook] Synced ${result.count || 0} processing logs`);
      }
    } catch (error: any) {
      console.error(`[GS-Webhook] Log sync error: ${error.message}`);
    }
  }

  public async updateStats(stats: any): Promise<void> {
    try {
      const result = await this.post({
        secret: this.secret,
        action: 'update_stats',
        stats,
      });
      if (result) {
        console.log('[GS-Webhook] Statistics updated');
      }
    } catch (error: any) {
      console.error(`[GS-Webhook] Stats sync error: ${error.message}`);
    }
  }

  public async testConnection(): Promise<boolean> {
    try {
      const result = await this.post({
        secret: this.secret,
        action: 'health',
      });
      return result?.success === true;
    } catch {
      return false;
    }
  }
}
