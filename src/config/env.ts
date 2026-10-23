import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const config = {
  estonia: {
    /** Official General data JSON zip (includes Contacts / sidevahendid). */
    generalDataUrl:
      process.env.ESTONIA_GENERAL_DATA_URL ||
      'https://avaandmed.ariregister.rik.ee/sites/default/files/avaandmed/ettevotja_rekvisiidid__yldandmed.json.zip',
    /** Optional local zip/json path to skip download (dev/tests). */
    localDumpPath: process.env.ESTONIA_LOCAL_DUMP_PATH || '',
    dataDir: process.env.ESTONIA_DATA_DIR || path.join(process.cwd(), 'data'),
    /** How many days back to include when no checkpoint exists. */
    lookbackDays: parseInt(process.env.ESTONIA_LOOKBACK_DAYS || '7', 10),
  },
  google: {
    webhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
    webhookSecret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || '',
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    maxCompaniesPerRun: parseInt(process.env.MAX_COMPANIES_PER_RUN || '200', 10),
    /** Default true — only sync NO_WEBSITE rows to Sheets (cold-outreach leads). */
    sheetsNoWebsiteOnly: process.env.SHEETS_NO_WEBSITE_ONLY !== 'false',
    /** When true, drop rows with neither phone nor email from Sheets sync. */
    sheetsRequireContact: process.env.SHEETS_REQUIRE_CONTACT === 'true',
    /**
     * When true, only sync rows that have an official phone (cold-call mode).
     * Overrides require-contact for sync filtering.
     */
    sheetsRequirePhone: process.env.SHEETS_REQUIRE_PHONE !== 'false',
    websiteProbeEnabled: process.env.WEBSITE_PROBE_ENABLED !== 'false',
    websiteMaxProbes: parseInt(process.env.WEBSITE_MAX_PROBES || '4', 10),
    websitePageTimeoutMs: parseInt(process.env.WEBSITE_PAGE_TIMEOUT_MS || '5000', 10),
    websiteCompanyTimeoutMs: parseInt(process.env.WEBSITE_COMPANY_TIMEOUT_MS || '20000', 10),
    concurrency: parseInt(process.env.PIPELINE_CONCURRENCY || '4', 10),
  },
};

export function validateConfig(): { valid: boolean; missing: string[] } {
  return { valid: true, missing: [] };
}

export function validateFullConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  const hasWebhook = !!(config.google.webhookUrl && config.google.webhookSecret);
  if (!hasWebhook) {
    missing.push('GOOGLE_SHEETS_WEBHOOK_URL+SECRET');
  }
  return { valid: missing.length === 0, missing };
}
