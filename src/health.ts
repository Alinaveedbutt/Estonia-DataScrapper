import { config, validateConfig, validateFullConfig } from './config/env';
import { connectDb, disconnectDb, getDbSizeEstimate } from './database/client';
import { chClient } from './companies-house/client';
import { GoogleSheetsWebhook } from './google-sheets/webhook';

async function healthCheck() {
  console.log('=== Health Check ===\n');
  let allOk = true;

  // 1. Config
  const { valid, missing } = validateConfig();
  if (valid) {
    console.log('✅ Core config: OK');
  } else {
    console.log(`❌ Core config: Missing ${missing.join(', ')}`);
    allOk = false;
  }

  const full = validateFullConfig();
  if (full.valid) {
    console.log('✅ Full config: OK');
  } else {
    console.log(`⚠️  Optional config: Missing ${full.missing.join(', ')}`);
  }

  // 2. Database
  const dbOk = await connectDb();
  if (dbOk) {
    console.log('✅ Database: Connected');
    const size = await getDbSizeEstimate();
    const mbStr = (size.sizeBytes / 1024 / 1024).toFixed(2);
    console.log(`   Companies: ${size.tables} | Logs: ${size.logCount} | Size: ${mbStr} MB`);
    console.log(`   Free-tier status: ${size.safeToContinue ? 'NORMAL ✅' : 'CRITICAL ❌'}`);
    if (!size.safeToContinue) allOk = false;
    await disconnectDb();
  } else {
    console.log('❌ Database: Connection failed');
    allOk = false;
  }

  // 3. Companies House
  if (config.companiesHouse.apiKey) {
    const chOk = await chClient.testConnection();
    if (chOk) {
      console.log('✅ Companies House API: Connected');
    } else {
      console.log('❌ Companies House API: Connection failed');
      allOk = false;
    }
  } else {
    console.log('⚠️  Companies House: No API key configured');
  }

  // 4. Google Apps Script Webhook
  const webhook = new GoogleSheetsWebhook();
  if (webhook.isConfigured()) {
    const gsOk = await webhook.testConnection();
    if (gsOk) {
      console.log('✅ Google Apps Script: Connected');
    } else {
      console.log('❌ Google Apps Script: Connection failed');
      allOk = false;
    }
  } else {
    console.log('⚠️  Google Apps Script: Webhook not configured');
  }

  // 5. Cost Safety Summary
  console.log('\n--- Zero-Cost Safety ---');
  console.log('  Database:          Neon Free PostgreSQL');
  console.log('  Search:            Optional (disabled by default)');
  console.log('  Contact sources:   Companies House page, Endole, Yell/192/Cylex direct lookup');
  console.log('  Crawler:           axios + cheerio (free/open-source)');
  console.log('  Google Sheets:     Apps Script Web App (free)');
  console.log('  Automation:        GitHub Actions standard runner (free)');
  console.log('  Paid fallbacks:    NONE');
  console.log('  Auto-upgrade:      DISABLED');

  console.log('\n' + (allOk ? '✅ All systems OK' : '❌ Some checks failed'));
  process.exit(allOk ? 0 : 1);
}

healthCheck();
