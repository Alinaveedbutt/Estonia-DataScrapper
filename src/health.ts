import axios from 'axios';
import { config, validateFullConfig } from './config/env';
import { GoogleSheetsWebhook } from './google-sheets/webhook';

async function main() {
  console.log('Estonia Company Pipeline — Health Check\n');

  let ok = true;

  // Open data URL reachable
  try {
    const res = await axios.head(config.estonia.generalDataUrl, {
      timeout: 20000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
      headers: { 'User-Agent': 'estonia-company-data-pipeline/1.0' },
    });
    console.log(`[OK] Open data URL reachable (HTTP ${res.status})`);
  } catch (err: any) {
    // Some hosts block HEAD — try a ranged GET
    try {
      await axios.get(config.estonia.generalDataUrl, {
        timeout: 20000,
        headers: { Range: 'bytes=0-64', 'User-Agent': 'estonia-company-data-pipeline/1.0' },
        validateStatus: (s) => s >= 200 && s < 500,
        maxContentLength: 1024,
      });
      console.log('[OK] Open data URL reachable (GET range)');
    } catch (err2: any) {
      ok = false;
      console.error(`[FAIL] Open data URL: ${err2.message}`);
    }
  }

  if (config.estonia.localDumpPath) {
    console.log(`[INFO] Local dump override: ${config.estonia.localDumpPath}`);
  }

  const full = validateFullConfig();
  if (full.valid) {
    const webhook = new GoogleSheetsWebhook();
    const sheetsOk = await webhook.testConnection();
    if (sheetsOk) console.log('[OK] Google Sheets webhook');
    else {
      ok = false;
      console.error('[FAIL] Google Sheets webhook');
    }
  } else {
    console.warn(`[WARN] Sheets not configured: ${full.missing.join(', ')}`);
  }

  console.log(ok ? '\nHealth check passed.' : '\nHealth check failed.');
  process.exit(ok ? 0 : 1);
}

main();
