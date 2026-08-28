import { getGoogleSheetsApi, getSpreadsheetId, rateLimitedSheetsCall } from './client';
import { prisma } from '../database/client';

export interface PipelineStats {
  totalCompanies: number;
  totalNoWebsite: number;
  totalWithWebsite: number;
  phonesFound: number;
  emailsFound: number;
  phoneAndEmail: number;
  notYetPublic: number;
  extractionFailures: number;
  failures: number;
  phoneCoverage: string;
  emailCoverage: string;
  phoneEmailCoverage: string;
}

export async function calculateStats(): Promise<PipelineStats> {
  const totalCompanies = await prisma.company.count();
  const totalNoWebsite = await prisma.company.count({ where: { website_status: 'NO_WEBSITE' } });
  const totalWithWebsite = await prisma.company.count({ where: { website_status: 'WEBSITE_EXISTS' } });
  const phonesFound = await prisma.company.count({
    where: { website_status: 'NO_WEBSITE', AND: [{ phone: { not: null } }, { phone: { not: '' } }] },
  });
  const emailsFound = await prisma.company.count({
    where: { website_status: 'NO_WEBSITE', AND: [{ email: { not: null } }, { email: { not: '' } }] },
  });
  const phoneAndEmail = await prisma.company.count({
    where: {
      website_status: 'NO_WEBSITE',
      AND: [
        { phone: { not: null } },
        { phone: { not: '' } },
        { email: { not: null } },
        { email: { not: '' } },
      ],
    },
  });
  const notYetPublic = await prisma.company.count({
    where: { website_status: 'NO_WEBSITE', contact_status: 'NOT_YET_PUBLIC' },
  });
  const extractionFailures = await prisma.company.count({
    where: {
      website_status: 'NO_WEBSITE',
      OR: [{ contact_status: 'EXTRACTION_FAILURE' }, { missing_reason: 'extraction_failure' }],
    },
  });
  const failures = await prisma.company.count({
    where: { processing_status: 'error' },
  });

  const pct = (n: number) => (totalNoWebsite > 0 ? ((n / totalNoWebsite) * 100).toFixed(1) + '%' : '0%');

  return {
    totalCompanies,
    totalNoWebsite,
    totalWithWebsite,
    phonesFound,
    emailsFound,
    phoneAndEmail,
    notYetPublic,
    extractionFailures,
    failures,
    phoneCoverage: pct(phonesFound),
    emailCoverage: pct(emailsFound),
    phoneEmailCoverage: pct(phoneAndEmail),
  };
}

export async function updateStatisticsSheet() {
  const sheets = await getGoogleSheetsApi();
  if (!sheets) return;

  const stats = await calculateStats();

  const values = [
    ['Metric', 'Value'],
    ['Total Companies', stats.totalCompanies],
    ['Website Exists', stats.totalWithWebsite],
    ['No Website', stats.totalNoWebsite],
    ['Phones Found (no website)', stats.phonesFound],
    ['Phone Coverage %', stats.phoneCoverage],
    ['Emails Found (no website)', stats.emailsFound],
    ['Email Coverage %', stats.emailCoverage],
    ['Phone + Email Found', stats.phoneAndEmail],
    ['Phone + Email Coverage %', stats.phoneEmailCoverage],
    ['No Contact Yet (expected)', stats.notYetPublic],
    ['Extraction Failures', stats.extractionFailures],
    ['Processing Errors', stats.failures],
    ['Last Updated', new Date().toISOString()],
  ];

  try {
    await rateLimitedSheetsCall(() =>
      sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: 'Statistics!A1:B13',
        valueInputOption: 'RAW',
        requestBody: { values },
      })
    );
    console.log('[GS] Statistics updated');
  } catch (e: any) {
    console.error('[GS] Statistics update error:', e.message);
  }
}

export function printStats(stats: PipelineStats) {
  console.log('\n=== UK COMPANY PIPELINE STATISTICS ===');
  console.log(`Total Companies:  ${stats.totalCompanies}`);
  console.log(`Website Exists:   ${stats.totalWithWebsite}`);
  console.log(`No Website:       ${stats.totalNoWebsite}`);
  console.log(`Phones Found:     ${stats.phonesFound} (${stats.phoneCoverage})`);
  console.log(`Emails Found:     ${stats.emailsFound} (${stats.emailCoverage})`);
  console.log(`Phone + Email:    ${stats.phoneAndEmail} (${stats.phoneEmailCoverage})`);
  console.log(`Failures:         ${stats.failures}`);
  console.log('=====================================\n');
}
