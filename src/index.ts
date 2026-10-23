import { config, validateConfig, validateFullConfig } from './config/env';
import { CompanyPipeline } from './pipeline/company-pipeline';

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  console.log('Estonia Company Data Pipeline v1.0');
  console.log('==================================\n');
  console.log('Source: e-Business Register open data (General data + Contacts)');
  console.log('Cost: $0 — no paid APIs, proxies, or CAPTCHA\n');

  const { valid, missing } = validateConfig();
  if (!valid) {
    console.error(`Missing required config: ${missing.join(', ')}`);
    process.exit(1);
  }

  const full = validateFullConfig();
  if (!full.valid) {
    console.warn(
      `Optional config missing (Google Sheets sync disabled): ${full.missing.join(', ')}`
    );
  }

  const options: {
    fromDate?: string;
    toDate?: string;
    maxCompanies?: number;
    skipSheetsSync?: boolean;
    skipWebsiteProbe?: boolean;
  } = {};

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--from' && args[i + 1]) options.fromDate = args[++i];
    else if (a === '--to' && args[i + 1]) options.toDate = args[++i];
    else if (a === '--max' && args[i + 1]) options.maxCompanies = parseInt(args[++i], 10);
    else if (a === '--skip-sheets') options.skipSheetsSync = true;
    else if (a === '--skip-website-probe') options.skipWebsiteProbe = true;
  }

  if (options.maxCompanies == null && config.app.maxCompaniesPerRun) {
    options.maxCompanies = config.app.maxCompaniesPerRun;
  }

  try {
    const pipeline = new CompanyPipeline();
    const result = await pipeline.runDailyScan(options);
    if (!result.success) process.exit(1);
  } catch (error: any) {
    console.error('Pipeline fatal error:', error.message);
    process.exit(1);
  }
}

function printHelp() {
  console.log(`Usage: npm run scan -- [options]

Options:
  --from YYYY-MM-DD     Start of registration date window
  --to YYYY-MM-DD       End of registration date window
  --max N               Max companies to keep after date filter
  --skip-sheets         Do not sync to Google Sheets
  --skip-website-probe  Only use register WWW; skip domain probing
  -h, --help            Show this help

Environment: see .env.example
`);
}

main();
