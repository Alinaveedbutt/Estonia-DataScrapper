import { getGoogleSheetsApi, getSpreadsheetId, rateLimitedSheetsCall } from './client';
import { prisma } from '../database/client';
import { format } from 'date-fns';
import { Company } from '@prisma/client';

const COMPANY_HEADERS = [
  'Company Number', 'Company Name', 'Incorporation Date', 'Company Status', 'Company Type',
  'Address Line 1', 'Address Line 2', 'Locality', 'Region', 'Postal Code', 'Country', 'Full Address',
  'Website Status', 'Website URL', 'Website Source',
  'Phone', 'Phone Source URL', 'Phone Source Type', 'Phone Confidence',
  'Email', 'Email Source URL', 'Email Source Type', 'Email Confidence',
  'Contact Status', 'Missing Reason', 'First Seen', 'Last Checked', 'Data Source',
];

const LOG_HEADERS = [
  'Timestamp', 'Company Number', 'Company Name', 'Processing Stage', 'Status', 'Error', 'Retry Count', 'Source URL',
];

export class GoogleSheetsWriter {
  public async ensureSheetTabs() {
    const sheets = await getGoogleSheetsApi();
    if (!sheets) return;

    try {
      const spreadsheet = await sheets.spreadsheets.get({
        spreadsheetId: getSpreadsheetId(),
      });
      const existingTabs = (spreadsheet.data.sheets || []).map((s) => s.properties?.title);

      const tabsNeeded = ['Companies', 'Processing Log', 'Statistics'];
      const toCreate = tabsNeeded.filter((t) => !existingTabs.includes(t));

      if (toCreate.length > 0) {
        await rateLimitedSheetsCall(() => sheets.spreadsheets.batchUpdate({
          spreadsheetId: getSpreadsheetId(),
          requestBody: {
            requests: toCreate.map((title) => ({
              addSheet: { properties: { title } },
            })),
          },
        }));
        console.log(`[GS] Created tabs: ${toCreate.join(', ')}`);
      }
    } catch (e: any) {
      console.error('[GS] Error ensuring tabs:', e.message);
    }
  }

  public async setupHeaders() {
    const sheets = await getGoogleSheetsApi();
    if (!sheets) return;

    try {
      await this.ensureSheetTabs();

      // Companies headers
      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `Companies!A1:${this.colLetter(COMPANY_HEADERS.length)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [COMPANY_HEADERS] },
      }));

      // Processing Log headers
      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'Processing Log'!A1:${this.colLetter(LOG_HEADERS.length)}1`,
        valueInputOption: 'RAW',
        requestBody: { values: [LOG_HEADERS] },
      }));

      console.log('[GS] Headers configured');
    } catch (e: any) {
      console.error('[GS] Header setup error:', e.message);
    }
  }

  public async syncAllCompanies() {
    const sheets = await getGoogleSheetsApi();
    if (!sheets) return;

    const companies = await prisma.company.findMany({
      orderBy: { date_of_creation: 'desc' },
    });

    if (companies.length === 0) return;

    const rows = companies.map((c) => this.companyToRow(c));

    try {
      // Clear existing data (keep headers)
      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.clear({
        spreadsheetId: getSpreadsheetId(),
        range: 'Companies!A2:Z10000',
      }));

      // Write all rows
      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `Companies!A2:${this.colLetter(COMPANY_HEADERS.length)}${rows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      }));

      console.log(`[GS] Synced ${rows.length} companies`);
    } catch (e: any) {
      console.error('[GS] Sync error:', e.message);
    }
  }

  public async syncProcessingLogs() {
    const sheets = await getGoogleSheetsApi();
    if (!sheets) return;

    const logs = await prisma.processingLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 500,
    });

    if (logs.length === 0) return;

    const rows = logs.map((log) => [
      format(log.timestamp, 'yyyy-MM-dd HH:mm:ss'),
      log.company_number,
      log.company_name || '',
      log.stage,
      log.status,
      log.error_message || '',
      log.retry_count,
      log.source_url || '',
    ]);

    try {
      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.clear({
        spreadsheetId: getSpreadsheetId(),
        range: "'Processing Log'!A2:H10000",
      }));

      await rateLimitedSheetsCall(() => sheets.spreadsheets.values.update({
        spreadsheetId: getSpreadsheetId(),
        range: `'Processing Log'!A2:H${rows.length + 1}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      }));
    } catch (e: any) {
      console.error('[GS] Log sync error:', e.message);
    }
  }

  private companyToRow(c: Company): any[] {
    const contactStatus =
      c.phone && c.email ? 'COMPLETE' :
      c.phone || c.email ? 'PARTIAL' :
      c.contact_status === 'NO_WEBSITE_FOUND' ? 'NO_WEBSITE_FOUND' :
      c.contact_status || 'NO_CONTACT_FOUND';

    return [
      c.company_number,
      c.company_name,
      c.date_of_creation ? format(c.date_of_creation, 'yyyy-MM-dd') : '',
      c.company_status || '',
      c.company_type || '',
      c.address_line_1 || '',
      c.address_line_2 || '',
      c.locality || '',
      c.region || '',
      c.postal_code || '',
      c.country || '',
      c.full_address || '',
      c.website_status || '',
      c.website_url || '',
      c.website_source || '',
      c.phone || '',
      c.phone_source_url || '',
      c.phone_source_type || '',
      c.phone_confidence || '',
      c.email || '',
      c.email_source_url || '',
      c.email_source_type || '',
      c.email_confidence || '',
      contactStatus,
      c.missing_reason || '',
      format(c.first_seen, 'yyyy-MM-dd HH:mm:ss'),
      format(c.last_checked, 'yyyy-MM-dd HH:mm:ss'),
      'Companies House',
    ];
  }

  private colLetter(n: number): string {
    let s = '';
    while (n > 0) {
      n--;
      s = String.fromCharCode(65 + (n % 26)) + s;
      n = Math.floor(n / 26);
    }
    return s;
  }
}
