import { validateConfig } from './config/env';
import { connectDb, disconnectDb, prisma } from './database/client';
import { EnrichmentPipeline } from './pipeline/enrichment-pipeline';
import { chClient } from './companies-house/client';
import { subDays, format } from 'date-fns';

/**
 * Final feasibility live test — max 10 companies, all website outcomes.
 * No Google CSE, no paid sources, no outreach.
 */
async function main() {
  console.log('=== FINAL FEASIBILITY LIVE TEST (max 10 companies) ===\n');
  console.log('Provider chain: CH page → CH filings → Yolist → FSA → Council (identity) → OpenCorporates\n');

  const { valid, missing } = validateConfig();
  if (!valid) {
    console.error(`Missing config: ${missing.join(', ')}`);
    process.exit(1);
  }

  const dbOk = await connectDb();
  if (!dbOk) process.exit(1);

  const targetCount = Math.min(10, Math.max(5, parseInt(process.env.LIVE_TEST_MAX || '10', 10)));
  const recentDate = format(subDays(new Date(), 3), 'yyyy-MM-dd');

  const pipeline = new EnrichmentPipeline();
  const results: Awaited<ReturnType<EnrichmentPipeline['processCompany']>>[] = [];
  let checked = 0;
  let startIndex = 0;
  const pageSize = 50;

  while (results.length < targetCount && checked < targetCount * 4) {
    const result = await chClient.searchCompaniesByDate(recentDate, startIndex, pageSize);
    if (result.items.length === 0) break;

    for (const item of result.items) {
      if (results.length >= targetCount) break;
      checked++;
      const outcome = await pipeline.processCompany(item);
      if (outcome.outcome === 'stored_with_website' || outcome.outcome === 'stored_no_website') {
        results.push(outcome);
      }
      if (checked >= targetCount * 4) break;
    }

    startIndex += pageSize;
    if (startIndex >= result.total) break;
  }

  const numbers = results.map((r) => r.companyNumber);
  const stored = await prisma.company.findMany({ where: { company_number: { in: numbers } } });

  const withWebsite = results.filter((r) => r.outcome === 'stored_with_website');
  const noWebsite = results.filter((r) => r.outcome === 'stored_no_website');
  const phones = noWebsite.filter((r) => r.phone).length;
  const emails = noWebsite.filter((r) => r.email).length;
  const both = noWebsite.filter((r) => r.phone && r.email).length;

  const fakePatterns = ['example.co.uk', 'example.com', '020 7123 4567', 'info@example'];
  const fakeHits = stored.filter((c) =>
    fakePatterns.some((p) => (c.phone && c.phone.includes(p)) || (c.email && c.email.includes(p)))
  );

  console.log('\n=== LIVE TEST RESULTS ===');
  console.log(`Companies processed:     ${results.length}`);
  console.log(`Website Exists:          ${withWebsite.length}`);
  console.log(`No Website:              ${noWebsite.length}`);
  console.log(`Phones found (verified): ${phones} / ${noWebsite.length || 1}`);
  console.log(`Emails found (verified): ${emails} / ${noWebsite.length || 1}`);
  console.log(`Phone + email:           ${both}`);
  console.log(`Fake/test data:          ${fakeHits.length === 0 ? 'NONE' : fakeHits.length + ' FOUND'}`);

  console.log('\n=== PER-COMPANY ===');
  for (const r of results) {
    const row = stored.find((c) => c.company_number === r.companyNumber);
    console.log(
      `  ${r.companyNumber} | ${row?.website_status || '?'} | Ph:${r.phone || '-'} Em:${r.email || '-'} | ${r.contactStatus || row?.contact_status || '-'}`
    );
  }

  console.log('\n=== FEASIBILITY (this run) ===');
  const phoneRate = noWebsite.length ? ((phones / noWebsite.length) * 100).toFixed(0) : '0';
  const emailRate = noWebsite.length ? ((emails / noWebsite.length) * 100).toFixed(0) : '0';
  console.log(`Phone coverage (no website): ${phoneRate}%`);
  console.log(`Email coverage (no website): ${emailRate}%`);

  await disconnectDb();

  if (results.length < 5) {
    console.warn(`\n[LiveTest] Only ${results.length} companies collected (target ${targetCount}).`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('Live test failed:', e.message);
  process.exit(1);
});
