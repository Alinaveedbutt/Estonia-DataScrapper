import axios from 'axios';
import { config } from '../config/env';
import { CompanyRecord } from '../types/company';
import { SheetsCompanyRow, toSheetsRow } from './row';

/**
 * Google Apps Script Webhook Client
 *
 * Free Apps Script Web App endpoint. Shared secret required.
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

  private async post(payload: unknown): Promise<any> {
    if (!this.isConfigured()) {
      console.warn('[GS-Webhook] Not configured. Skipping.');
      return null;
    }

    let lastError: any;
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const response = await axios.post(this.url, payload, {
          timeout: 60000,
          headers: { 'Content-Type': 'application/json' },
          maxRedirects: 5,
          validateStatus: (s) => s >= 200 && s < 400,
        });

        const data =
          typeof response.data === 'string' ? JSON.parse(response.data) : response.data;

        if (data?.success === false) {
          throw new Error(`Apps Script error: ${data.error || 'unknown'}`);
        }

        return data;
      } catch (error: any) {
        lastError = error;
        if (error?.response?.status === 429 || error?.code === 'ECONNRESET') {
          const backoff = Math.pow(2, attempt + 1) * 3000;
          console.warn(`[GS-Webhook] Retrying in ${backoff / 1000}s…`);
          await new Promise((r) => setTimeout(r, backoff));
        } else {
          throw error;
        }
      }
    }
    throw lastError || new Error('Webhook retries exhausted');
  }

  public async syncCompanies(companies: CompanyRecord[], runAt: Date = new Date()): Promise<void> {
    if (companies.length === 0) return;

    const rows: SheetsCompanyRow[] = companies.map((c) => toSheetsRow(c, runAt));
    const batchSize = 50;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      try {
        const result = await this.post({
          secret: this.secret,
          action: 'sync_companies',
          companies: batch,
        });
        if (result) {
          console.log(
            `[GS-Webhook] Synced batch: ${result.inserted || 0} inserted, ${result.updated || 0} updated` +
              (result.purged != null ? `, purged ${result.purged} old rows` : '')
          );
        }
      } catch (error: any) {
        console.error(`[GS-Webhook] Company sync error: ${error.message}`);
        throw error;
      }
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
