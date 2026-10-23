import pLimit from 'p-limit';
import { config } from '../config/env';
import { discoverWebsite } from '../discovery/website-discovery';
import { ensureGeneralDataDump } from '../estonia/download';
import { mapCompany } from '../estonia/mapper';
import { parseNewCompanies } from '../estonia/parser';
import { GoogleSheetsWebhook } from '../google-sheets/webhook';
import { CompanyRecord, PipelineStats } from '../types/company';
import {
  getScanDateRange,
  loadPipelineState,
  savePipelineState,
  shouldAdvanceCheckpoint,
} from './checkpoint';
import { filterForSheets, prioritizeForOutreach } from './prioritize';

export interface PipelineRunOptions {
  fromDate?: string;
  toDate?: string;
  maxCompanies?: number;
  skipSheetsSync?: boolean;
  skipWebsiteProbe?: boolean;
}

function pct(n: number, d: number): string {
  if (d <= 0) return '0%';
  return `${((n / d) * 100).toFixed(1)}%`;
}

export class CompanyPipeline {
  private webhook = new GoogleSheetsWebhook();

  public async runDailyScan(options: PipelineRunOptions = {}) {
    console.log('\n=== Estonia Company Pipeline Starting ===\n');

    const state = loadPipelineState();
    state.last_attempted_scan = new Date().toISOString();
    savePipelineState(state);

    const scanRange =
      options.fromDate && options.toDate
        ? {
            fromDate: options.fromDate,
            toDate: options.toDate,
            dates: [options.fromDate],
          }
        : getScanDateRange(state.last_successful_scan);

    if (scanRange.dates.length === 0 && !(options.fromDate && options.toDate)) {
      console.log('[Pipeline] No new registration dates to scan. Checkpoint is up to date.');
      return { success: true, stats: null as PipelineStats | null, companies: [] as CompanyRecord[] };
    }

    console.log(`[Pipeline] Registration window: ${scanRange.fromDate} → ${scanRange.toDate}`);

    const dump = await ensureGeneralDataDump();
    const maxCompanies = options.maxCompanies ?? config.app.maxCompaniesPerRun;

    // Collect full date window first (do not early-cap during alphabetical scan).
    const parsed = await parseNewCompanies(dump.zipPath, {
      fromDate: scanRange.fromDate,
      toDate: scanRange.toDate,
    });

    const probeEnabled = options.skipWebsiteProbe ? false : config.app.websiteProbeEnabled;
    const limit = pLimit(config.app.concurrency);
    let failures = 0;

    const mapped = await Promise.all(
      parsed.companies.map((raw) =>
        limit(async () => {
          try {
            const discovery = await discoverWebsite(raw, { probeEnabled });
            return mapCompany(raw, {
              websiteStatus: discovery.status,
              websiteUrl: discovery.website,
              websiteSource: discovery.source,
            });
          } catch (err: any) {
            failures += 1;
            console.warn(
              `[Pipeline] Failed ${raw.ariregistri_kood} ${raw.nimi}: ${err?.message || err}`
            );
            return mapCompany(raw, {
              websiteStatus: 'NO_WEBSITE',
              websiteUrl: null,
              websiteSource: null,
            });
          }
        })
      )
    );

    // Phone-first outreach order, then optional cap so --max keeps callable leads.
    let ordered = prioritizeForOutreach(mapped);
    if (maxCompanies > 0 && ordered.length > maxCompanies) {
      console.log(
        `[Pipeline] Capping ${ordered.length} → ${maxCompanies} after phone/NO_WEBSITE prioritisation`
      );
      ordered = ordered.slice(0, maxCompanies);
    }

    const noWebsite = ordered.filter((c) => c.website_status === 'NO_WEBSITE');
    const withWebsite = ordered.filter((c) => c.website_status === 'WEBSITE_EXISTS');
    const phonesFound = noWebsite.filter((c) => c.phone).length;
    const emailsFound = noWebsite.filter((c) => c.email).length;
    const phoneAndEmail = noWebsite.filter((c) => c.phone && c.email).length;
    const notYetPublic = noWebsite.filter((c) => c.contact_status === 'NOT_YET_PUBLIC').length;

    const stats: PipelineStats = {
      totalCompanies: ordered.length,
      totalNoWebsite: noWebsite.length,
      totalWithWebsite: withWebsite.length,
      phonesFound,
      emailsFound,
      phoneAndEmail,
      notYetPublic,
      failures,
      phoneCoverage: pct(phonesFound, noWebsite.length),
      emailCoverage: pct(emailsFound, noWebsite.length),
      phoneEmailCoverage: pct(phoneAndEmail, noWebsite.length),
      lastSuccessfulRun: '',
      lastAttemptedRun: state.last_attempted_scan || '',
      scanFrom: scanRange.fromDate,
      scanTo: scanRange.toDate,
      sourceFile: dump.source,
    };

    console.log('\n=== Run summary ===');
    console.log(
      `Companies: ${stats.totalCompanies} (NO WEBSITE: ${stats.totalNoWebsite}, with website: ${stats.totalWithWebsite})`
    );
    console.log(
      `NO WEBSITE contacts — phone: ${phonesFound}/${noWebsite.length} (${stats.phoneCoverage}), email: ${emailsFound}/${noWebsite.length} (${stats.emailCoverage}), both: ${stats.phoneEmailCoverage}`
    );

    let runSucceeded = true;

    if (!options.skipSheetsSync && this.webhook.isConfigured()) {
      const toSync = filterForSheets(ordered, {
        noWebsiteOnly: config.app.sheetsNoWebsiteOnly,
        requireContact: config.app.sheetsRequireContact,
        requirePhone: config.app.sheetsRequirePhone,
      });
      console.log(
        `[Pipeline] Syncing ${toSync.length} rows to Google Sheets` +
          ` (NO_WEBSITE only=${config.app.sheetsNoWebsiteOnly}, requirePhone=${config.app.sheetsRequirePhone})…`
      );
      try {
        await this.webhook.syncCompanies(toSync, new Date());
      } catch (err: any) {
        runSucceeded = false;
        console.error(`[Pipeline] Sheets sync failed: ${err.message}`);
      }
    } else if (!options.skipSheetsSync) {
      console.warn(
        '[Pipeline] Google Sheets webhook not configured — results kept in-memory only for this run.'
      );
    }

    if (
      shouldAdvanceCheckpoint(
        runSucceeded,
        scanRange.dates.length > 0 || !!(options.fromDate && options.toDate)
      )
    ) {
      state.last_successful_scan = scanRange.toDate;
      state.updated_at = new Date().toISOString();
      savePipelineState(state);
      stats.lastSuccessfulRun = state.last_successful_scan;
      console.log(`[Pipeline] Checkpoint advanced to ${state.last_successful_scan}`);
    }

    return { success: runSucceeded, stats, companies: ordered };
  }
}
