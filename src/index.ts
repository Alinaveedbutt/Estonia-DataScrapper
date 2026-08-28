import { config, validateConfig, validateFullConfig } from './config/env';
import { connectDb, disconnectDb } from './database/client';
import { CompanyPipeline } from './pipeline/company-pipeline';

async function main() {
  console.log('UK Company Data Pipeline v1.0');
  console.log('=============================\n');

  // Validate core config
  const { valid, missing } = validateConfig();
  if (!valid) {
    console.error(`Missing required config: ${missing.join(', ')}`);
    console.error('Please set these in your .env file or environment.');
    process.exit(1);
  }

  // Warn about optional config
  const full = validateFullConfig();
  if (!full.valid) {
    console.warn(`Optional config missing (Google Sheets sync disabled): ${full.missing.join(', ')}`);
  }

  // Connect to database
  const dbOk = await connectDb();
  if (!dbOk) {
    console.error('Cannot connect to database. Exiting.');
    process.exit(1);
  }

  try {
    const pipeline = new CompanyPipeline();
    await pipeline.runDailyScan();
  } catch (error: any) {
    console.error('Pipeline fatal error:', error.message);
    process.exit(1);
  } finally {
    await disconnectDb();
  }
}

main();
