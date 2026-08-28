import { chClient } from '../companies-house/client';
import { EnrichmentPipeline, ProcessCompanyResult } from './enrichment-pipeline';
import { prisma, cleanupOldLogs, getDbSizeEstimate } from '../database/client';
import { GoogleSheetsWebhook } from '../google-sheets/webhook';
import { config } from '../config/env';
import { format, startOfDay } from 'date-fns';
import { getScanDateRange, shouldAdvanceCheckpoint } from './checkpoint';
import { isEligibleForReEnrichment, parseReEnrichmentSchedule } from './re-enrichment';

export interface PipelineStats {
  totalCompanies: number;
  totalNoWebsite: number;
  totalWithWebsite: number;
  companiesCheckedToday: number;
  companiesWithWebsiteToday: number;
  noWebsiteAddedToday: number;
  phonesFound: number;
  emailsFound: number;
  phoneAndEmail: number;
  notYetPublic: number;
  extractionFailures: number;
  failures: number;
  phoneCoverage: string;
  emailCoverage: string;
  phoneEmailCoverage: string;
  dbSizeMB: string;
  dbStatus: string;
  lastSuccessfulRun: string;
  lastAttemptedRun: string;
}

export interface PipelineRunOptions {
  scanDates?: string[];
  maxCompanies?: number;
  skipReEnrichment?: boolean;
  skipSheetsSync?: boolean;
}

export class CompanyPipeline {
  private enrichment = new EnrichmentPipeline();
  private webhook = new GoogleSheetsWebhook();

  public async runDailyScan(options: PipelineRunOptions = {}) {
    console.log('\n=== UK Company Pipeline Starting ===\n');

    const dbInfo = await getDbSizeEstimate();
    if (!dbInfo.safeToContinue) {
      console.error(
        `[CRITICAL] Database size (${(dbInfo.sizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds safe free-tier threshold. Halting to prevent billing.`
      );
      return { success: false, stats: null as PipelineStats | null, runResults: [] as ProcessCompanyResult[] };
    }
    console.log(
      `[DB] Size: ${(dbInfo.sizeBytes / 1024 / 1024).toFixed(2)} MB | Leads: ${dbInfo.tables} | Logs: ${dbInfo.logCount}`
    );

    let state = await prisma.pipelineState.findUnique({ where: { id: 'default' } });
    if (!state) {
      state = await prisma.pipelineState.create({ data: { id: 'default' } });
    }

    await prisma.pipelineState.update({
      where: { id: 'default' },
      data: { last_attempted_scan: new Date() },
    });

    const scanRange = options.scanDates
      ? { dates: options.scanDates, scanFrom: new Date(options.scanDates[0]), scanTo: new Date(options.scanDates[options.scanDates.length - 1]) }
      : getScanDateRange(state.last_successful_scan);

    if (scanRange.dates.length === 0) {
      console.log('[Pipeline] No new incorporation dates to scan. Checkpoint is up to date.');
    } else {
      console.log(`[Pipeline] Scanning incorporation dates: ${scanRange.dates.join(', ')}`);
    }

    const maxPerRun = options.maxCompanies ?? config.app.maxCompaniesPerRun;
    let totalChecked = 0;
    let totalWithWebsite = 0;
    let totalNoWebsite = 0;
    let runSucceeded = true;
    let lastCompletedDate: Date | null = null;
    const runResults: ProcessCompanyResult[] = [];

    for (const dateStr of scanRange.dates) {
      if (totalChecked >= maxPerRun) break;

      let startIndex = 0;
      const pageSize = 50;
      let hasMore = true;

      while (hasMore && totalChecked < maxPerRun) {
        try {
          const result = await chClient.searchCompaniesByDate(dateStr, startIndex, pageSize);

          if (result.items.length === 0) {
            hasMore = false;
            break;
          }

          console.log(
            `[Pipeline] ${dateStr}: fetched ${result.items.length} companies (${startIndex + result.items.length}/${result.total})`
          );

          for (const item of result.items) {
            if (totalChecked >= maxPerRun) break;
            try {
              const outcome = await this.enrichment.processCompany(item);
              runResults.push(outcome);
              if (outcome.outcome === 'stored_with_website') totalWithWebsite++;
              else if (outcome.outcome === 'stored_no_website') totalNoWebsite++;
            } catch {
              runSucceeded = false;
            }
            totalChecked++;
          }

          startIndex += pageSize;
          if (startIndex >= result.total) hasMore = false;
        } catch (error: any) {
          console.error(`[Pipeline] Page fetch error for ${dateStr}: ${error.message}`);
          runSucceeded = false;
          hasMore = false;
        }
      }

      if (runSucceeded) {
        lastCompletedDate = startOfDay(new Date(dateStr));
      } else {
        break;
      }
    }

    if (!options.skipReEnrichment) {
      await this.runReEnrichment(options.maxCompanies ? Math.min(10, options.maxCompanies) : 20);
    }

    await cleanupOldLogs(config.app.maxLogRetentionDays);

    const stats = await this.calculateStats(totalChecked, totalWithWebsite, totalNoWebsite);

    if (!options.skipSheetsSync) {
      await this.syncToGoogleSheets(stats);
    }

    if (!options.scanDates && shouldAdvanceCheckpoint(runSucceeded, lastCompletedDate)) {
      await prisma.pipelineState.update({
        where: { id: 'default' },
        data: {
          last_successful_scan: lastCompletedDate,
          companies_processed: { increment: totalNoWebsite },
          companies_checked: { increment: totalChecked },
          companies_with_website: { increment: totalWithWebsite },
        },
      });
      console.log(`[Pipeline] Checkpoint advanced to ${format(lastCompletedDate!, 'yyyy-MM-dd')}`);
    } else if (!runSucceeded) {
      console.warn('[Pipeline] Run had failures — checkpoint NOT advanced.');
    }

    this.printStats(stats);
    console.log(`[Pipeline] Run complete. Checked ${totalChecked}, with website ${totalWithWebsite}, no website ${totalNoWebsite}.\n`);

    return { success: runSucceeded, stats, runResults };
  }

  public async syncRecentToSheets(checkedToday = 0) {
    const stats = await this.calculateStats(checkedToday, 0, 0);
    await this.syncToGoogleSheets(stats);
  }

  private async syncToGoogleSheets(stats: PipelineStats) {
    console.log('\n[Pipeline] Syncing to Google Sheets...');

    if (!this.webhook.isConfigured()) {
      console.warn('[Pipeline] Google Sheets webhook not configured. Skipping sync.');
      return;
    }

    try {
      const recentCompanies = await prisma.company.findMany({
        orderBy: { updated_at: 'desc' },
        take: 500,
      });

      const companyPayload = recentCompanies.map((c) => ({
        company_number: c.company_number,
        company_name: c.company_name,
        date_of_creation: c.date_of_creation ? format(c.date_of_creation, 'yyyy-MM-dd') : '',
        company_status: c.company_status || '',
        company_type: c.company_type || '',
        address_line_1: c.address_line_1 || '',
        address_line_2: c.address_line_2 || '',
        locality: c.locality || '',
        region: c.region || '',
        postal_code: c.postal_code || '',
        country: c.country || '',
        full_address: c.full_address || '',
        website_status: c.website_status || '',
        website_url: c.website_url || '',
        website_source: c.website_source || '',
        phone: c.phone || '',
        phone_source_url: c.phone_source_url || '',
        phone_source_type: c.phone_source_type || '',
        phone_confidence: c.phone_confidence || '',
        email: c.email || '',
        email_source_url: c.email_source_url || '',
        email_source_type: c.email_source_type || '',
        email_confidence: c.email_confidence || '',
        phone_missing_reason: c.phone_missing_reason || '',
        email_missing_reason: c.email_missing_reason || '',
        contact_status: c.contact_status || '',
        first_seen: format(c.first_seen, 'yyyy-MM-dd HH:mm:ss'),
        last_checked: format(c.last_checked, 'yyyy-MM-dd HH:mm:ss'),
      }));

      await this.webhook.syncCompanies(companyPayload);

      const logs = await prisma.processingLog.findMany({
        orderBy: { timestamp: 'desc' },
        take: 200,
      });

      const logPayload = logs.map((log) => ({
        timestamp: format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
        company_number: log.company_number,
        company_name: log.company_name || '',
        stage: log.stage,
        status: log.status,
        error_message: log.error_message || '',
        retry_count: log.retry_count,
        source_url: log.source_url || '',
      }));

      await this.webhook.syncLogs(logPayload);
      await this.webhook.updateStats(stats);

      console.log('[Pipeline] Google Sheets sync complete.');
    } catch (e: any) {
      console.error(`[Pipeline] Google Sheets sync error: ${e.message}`);
    }
  }

  private async calculateStats(
    checkedToday: number,
    withWebsiteToday: number,
    noWebsiteToday: number
  ): Promise<PipelineStats> {
    const totalCompanies = await prisma.company.count();
    const totalNoWebsite = await prisma.company.count({ where: { website_status: 'NO_WEBSITE' } });
    const totalWithWebsite = await prisma.company.count({ where: { website_status: 'WEBSITE_EXISTS' } });
    const phonesFound = await prisma.company.count({
      where: { website_status: 'NO_WEBSITE', phone: { not: null } },
    });
    const emailsFound = await prisma.company.count({
      where: { website_status: 'NO_WEBSITE', email: { not: null } },
    });
    const phoneAndEmail = await prisma.company.count({
      where: { website_status: 'NO_WEBSITE', phone: { not: null }, email: { not: null } },
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
    const failures = await prisma.company.count({ where: { processing_status: 'error' } });

    const pct = (n: number) => (totalNoWebsite > 0 ? ((n / totalNoWebsite) * 100).toFixed(1) + '%' : '0%');

    const dbInfo = await getDbSizeEstimate();
    const pipelineState = await prisma.pipelineState.findUnique({ where: { id: 'default' } });

    return {
      totalCompanies,
      totalNoWebsite,
      totalWithWebsite,
      companiesCheckedToday: checkedToday,
      companiesWithWebsiteToday: withWebsiteToday,
      noWebsiteAddedToday: noWebsiteToday,
      phonesFound,
      emailsFound,
      phoneAndEmail,
      notYetPublic,
      extractionFailures,
      failures,
      phoneCoverage: pct(phonesFound),
      emailCoverage: pct(emailsFound),
      phoneEmailCoverage: pct(phoneAndEmail),
      dbSizeMB: (dbInfo.sizeBytes / 1024 / 1024).toFixed(2),
      dbStatus: dbInfo.safeToContinue ? 'NORMAL' : 'CRITICAL',
      lastSuccessfulRun: pipelineState?.last_successful_scan?.toISOString() || 'N/A',
      lastAttemptedRun: pipelineState?.last_attempted_scan?.toISOString() || 'N/A',
    };
  }

  private printStats(stats: PipelineStats) {
    console.log('\n=== UK COMPANY PIPELINE STATISTICS ===');
    console.log(`Total Companies:           ${stats.totalCompanies}`);
    console.log(`Website Exists:            ${stats.totalWithWebsite}`);
    console.log(`No Website (enrichment):   ${stats.totalNoWebsite}`);
    console.log(`Phones Found (no website): ${stats.phonesFound} (${stats.phoneCoverage})`);
    console.log(`Emails Found (no website): ${stats.emailsFound} (${stats.emailCoverage})`);
    console.log(`Phone + Email:             ${stats.phoneAndEmail} (${stats.phoneEmailCoverage})`);
    console.log(`Not Yet Public (expected): ${stats.notYetPublic}`);
    console.log(`Extraction Failures:       ${stats.extractionFailures}`);
    console.log(`Processing Errors:         ${stats.failures}`);
    console.log(`Coverage is a trend — re-enrichment runs Day 1/3/7/14/30`);
    console.log(`Database Size:             ${stats.dbSizeMB} MB (${stats.dbStatus})`);
    console.log(`Last Successful Run:       ${stats.lastSuccessfulRun}`);
    console.log('==================================================\n');
  }

  private async runReEnrichment(limit = 20) {
    const schedule = parseReEnrichmentSchedule(config.app.reEnrichmentDays);
    const allCandidates = await prisma.company.findMany({
      where: {
        website_status: 'NO_WEBSITE',
        processing_status: { in: ['completed', 'error'] },
        OR: [{ phone: null }, { email: null }],
      },
      take: 200,
    });

    const candidates = allCandidates
      .filter((c) => isEligibleForReEnrichment(c, schedule))
      .slice(0, limit);

    if (candidates.length === 0) return;

    console.log(`\n[Re-Enrichment] Retrying ${candidates.length} incomplete leads (schedule: ${schedule.join(', ')} days)`);

    for (const company of candidates) {
      try {
        await this.enrichment.processCompany({
          company_number: company.company_number,
          company_name: company.company_name,
          company_status: company.company_status || 'active',
          type: company.company_type || 'ltd',
          date_of_creation: company.date_of_creation?.toISOString().split('T')[0] || '',
          registered_office_address: {
            address_line_1: company.address_line_1 || undefined,
            address_line_2: company.address_line_2 || undefined,
            locality: company.locality || undefined,
            region: company.region || undefined,
            postal_code: company.postal_code || undefined,
            country: company.country || undefined,
          },
        });
      } catch {
        /* individual failures must not stop batch */
      }
    }
  }
}
