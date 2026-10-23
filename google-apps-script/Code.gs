// ============================================================
// Google Apps Script — Estonia Company Pipeline Webhook Receiver
// ============================================================
// Deploy this as a Web App in Google Apps Script.
//
// SETUP:
// 1. Open your Google Sheet
// 2. Extensions > Apps Script
// 3. Paste this entire code into Code.gs
// 4. Set WEBHOOK_SECRET via Project Settings > Script Properties
// 5. Deploy > New deployment > Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the Web App URL → GOOGLE_SHEETS_WEBHOOK_URL
// 7. Same secret → GOOGLE_SHEETS_WEBHOOK_SECRET
//
// Cold-call note: Phone is a first-class column. Default pipeline sync
// prefers NO_WEBSITE rows that have an official register phone.
// ============================================================

function getWebhookSecret() {
  return PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || '';
}

const COMPANIES_SHEET = 'Companies';
const STATS_SHEET = 'Statistics';

// Cold-outreach columns (Estonia) — Phone is required for cold-call workflows
const COMPANY_HEADERS = [
  'Registry Code', 'Company Name', 'Registration Date', 'Status', 'Status Text', 'Legal Form',
  'Address Line', 'Locality', 'Postal Code', 'Country', 'Full Address',
  'Website Status', 'Website URL', 'Website Source',
  'Phone', 'Phone Type', 'Email', 'Contact Source', 'Contact Status',
  'Phone Missing Reason', 'Email Missing Reason',
  'First Seen', 'Last Checked', 'Data Source'
];

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const expectedSecret = getWebhookSecret();
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const action = payload.action || 'sync_companies';

    if (action === 'sync_companies') {
      return handleSyncCompanies(payload);
    } else if (action === 'update_stats') {
      return handleUpdateStats(payload);
    } else if (action === 'health') {
      return ContentService.createTextOutput(JSON.stringify({
        success: true, message: 'Healthy'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: 'Unknown action: ' + action
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false, error: 'Server error: ' + err.message
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function handleSyncCompanies(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(COMPANIES_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(COMPANIES_SHEET);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  }

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  } else {
    // Keep headers in sync when columns are added (e.g. Phone Type)
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  }

  const companies = payload.companies || [];
  if (companies.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true, inserted: 0, updated: 0
    })).setMimeType(ContentService.MimeType.JSON);
  }

  const data = sheet.getDataRange().getValues();
  const companyIndex = {};
  for (let i = 1; i < data.length; i++) {
    const cn = String(data[i][0]).trim();
    if (cn) companyIndex[cn] = i + 1;
  }

  let inserted = 0;
  let updated = 0;

  for (const c of companies) {
    const row = companyToRow(c);
    const key = String(c.registry_code || '').trim();
    const existingRow = companyIndex[key];

    if (existingRow) {
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      sheet.appendRow(row);
      companyIndex[key] = sheet.getLastRow();
      inserted++;
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true, inserted: inserted, updated: updated
  })).setMimeType(ContentService.MimeType.JSON);
}

function companyToRow(c) {
  return [
    c.registry_code || '',
    c.company_name || '',
    c.registration_date || '',
    c.company_status || '',
    c.company_status_text || '',
    c.legal_form || '',
    c.address_line || '',
    c.locality || '',
    c.postal_code || '',
    c.country || '',
    c.full_address || '',
    c.website_status || '',
    c.website_url || '',
    c.website_source || '',
    c.phone || '',
    c.phone_type || '',
    c.email || '',
    c.contact_source || '',
    c.contact_status || '',
    c.phone_missing_reason || '',
    c.email_missing_reason || '',
    c.first_seen || '',
    c.last_checked || '',
    c.data_source || 'e-Business Register open data'
  ];
}

function handleUpdateStats(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET);
  }

  const stats = payload.stats || {};

  const rows = [
    ['Metric', 'Value'],
    ['Total Companies (run)', stats.totalCompanies || 0],
    ['Website Exists', stats.totalWithWebsite || 0],
    ['No Website (outreach priority)', stats.totalNoWebsite || 0],
    ['Phone Coverage % (no website)', stats.phoneCoverage || '0%'],
    ['Email Coverage % (no website)', stats.emailCoverage || '0%'],
    ['Phone + Email Coverage % (no website)', stats.phoneEmailCoverage || '0%'],
    ['Phones Found (no website)', stats.phonesFound || 0],
    ['Emails Found (no website)', stats.emailsFound || 0],
    ['Phone + Email Found (no website)', stats.phoneAndEmail || 0],
    ['Sheets Rows Synced', stats.sheetsSynced || 0],
    ['Sheets Require Phone', stats.sheetsRequirePhone === true || stats.sheetsRequirePhone === 'true' ? 'yes' : 'no'],
    ['No Website — No Contact Yet', stats.notYetPublic || 0],
    ['Processing Errors', stats.failures || 0],
    ['Scan From', stats.scanFrom || ''],
    ['Scan To', stats.scanTo || ''],
    ['Source', stats.sourceFile || ''],
    ['Last Successful Run Checkpoint', stats.lastSuccessfulRun || ''],
    ['Last Attempted Run', stats.lastAttemptedRun || '']
  ];

  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');

  return ContentService.createTextOutput(JSON.stringify({
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}
