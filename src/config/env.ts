import dotenv from 'dotenv';

dotenv.config();

export const config = {
  companiesHouse: {
    apiKey: process.env.COMPANIES_HOUSE_API_KEY || '',
  },
  database: {
    url: process.env.DATABASE_URL || '',
  },
  google: {
    // Apps Script webhook (production path — zero cost)
    webhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
    webhookSecret: process.env.GOOGLE_SHEETS_WEBHOOK_SECRET || '',
    // Legacy service-account (local testing)
    sheetId: process.env.GOOGLE_SHEETS_ID || '',
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
    privateKey: (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    // Optional Yolist free-tier API key (not required for unauthenticated tier)
    cse: {
      apiKey: process.env.GOOGLE_CSE_API_KEY || '',
      cx: process.env.GOOGLE_CSE_CX || '',
      dailyCap: parseInt(process.env.GOOGLE_CSE_DAILY_CAP || '50', 10),
      maxQueriesPerCompany: parseInt(process.env.GOOGLE_CSE_MAX_QUERIES_PER_COMPANY || '2', 10),
      get enabled(): boolean {
        return !!(process.env.GOOGLE_CSE_API_KEY && process.env.GOOGLE_CSE_CX);
      },
    },
  },
  yolist: {
    apiKey: process.env.YOLIST_API_KEY || '',
  },
  app: {
    logLevel: process.env.LOG_LEVEL || 'info',
    crawlMaxPages: parseInt(process.env.CRAWL_MAX_PAGES || '8', 10),
    maxCompaniesPerRun: parseInt(process.env.MAX_COMPANIES_PER_RUN || '100', 10),
    maxLogRetentionDays: parseInt(process.env.MAX_LOG_RETENTION_DAYS || '30', 10),
    reEnrichmentDays: process.env.RE_ENRICHMENT_DAYS || '1,3,7,14,30',
    // No-website contact enrichment budgets (search disabled by default)
    noWebsiteMaxPageFetches: parseInt(process.env.NO_WEBSITE_MAX_PAGE_FETCHES || '8', 10),
    noWebsiteMaxSearchRequests: parseInt(process.env.NO_WEBSITE_MAX_SEARCH_REQUESTS || '0', 10),
    noWebsiteCompanyTimeoutMs: parseInt(process.env.NO_WEBSITE_COMPANY_TIMEOUT_MS || '45000', 10),
    noWebsitePageTimeoutMs: parseInt(process.env.NO_WEBSITE_PAGE_TIMEOUT_MS || '5000', 10),
    noWebsiteSearchTimeoutMs: parseInt(process.env.NO_WEBSITE_SEARCH_TIMEOUT_MS || '4000', 10),
    // Website discovery budgets
    websiteMaxSearchRequests: parseInt(process.env.WEBSITE_MAX_SEARCH_REQUESTS || '1', 10),
    websiteCompanyTimeoutMs: parseInt(process.env.WEBSITE_COMPANY_TIMEOUT_MS || '30000', 10),
    websitePageTimeoutMs: parseInt(process.env.WEBSITE_PAGE_TIMEOUT_MS || '5000', 10),
    websiteSearchTimeoutMs: parseInt(process.env.WEBSITE_SEARCH_TIMEOUT_MS || '4000', 10),
    // Optional search engine (off by default for contact enrichment)
    enableOptionalSearch: process.env.ENABLE_OPTIONAL_SEARCH === 'true',
  },
};

export function validateConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.companiesHouse.apiKey) missing.push('COMPANIES_HOUSE_API_KEY');
  if (!config.database.url) missing.push('DATABASE_URL');
  return { valid: missing.length === 0, missing };
}

export function validateFullConfig(): { valid: boolean; missing: string[] } {
  const { missing } = validateConfig();
  // Check for webhook (production) OR service-account (legacy)
  const hasWebhook = config.google.webhookUrl && config.google.webhookSecret;
  const hasServiceAccount = config.google.sheetId && config.google.serviceAccountEmail && config.google.privateKey;
  if (!hasWebhook && !hasServiceAccount) {
    missing.push('GOOGLE_SHEETS_WEBHOOK_URL+SECRET or GOOGLE service-account credentials');
  }
  return { valid: missing.length === 0, missing };
}
