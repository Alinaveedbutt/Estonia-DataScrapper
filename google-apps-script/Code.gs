// ============================================================
// Google Apps Script — UK Company Pipeline Webhook Receiver
// ============================================================
// Deploy this as a Web App in Google Apps Script.
//
// SETUP:
// 1. Open your Google Sheet
// 2. Extensions > Apps Script
// 3. Paste this entire code into Code.gs
// 4. Set WEBHOOK_SECRET to a strong random string
// 5. Deploy > New deployment > Web app
//    - Execute as: Me
//    - Who has access: Anyone
// 6. Copy the Web App URL
// 7. Store it as GOOGLE_SHEETS_WEBHOOK_URL in .env / GitHub Secrets
// 8. Store the same secret as GOOGLE_SHEETS_WEBHOOK_SECRET
// ============================================================

// ---- CONFIGURATION ----
// The secret is stored in Script Properties, NOT in source code.
// Set it via: Apps Script Editor > Project Settings > Script Properties > Add:
//   Key:   WEBHOOK_SECRET
//   Value: (your strong random secret)
function getWebhookSecret() {
  return PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || '';
}

// ---- SHEET NAMES ----
const COMPANIES_SHEET = 'Companies';
const LOG_SHEET = 'Processing Log';
const STATS_SHEET = 'Statistics';

// ---- COMPANY HEADERS ----
const COMPANY_HEADERS = [
  'Company Number', 'Company Name', 'Incorporation Date', 'Company Status', 'Company Type',
  'Address Line 1', 'Address Line 2', 'Locality', 'Region', 'Postal Code', 'Country', 'Full Address',
  'Website Status', 'Website URL', 'Website Source',
  'Phone', 'Phone Source URL', 'Phone Source Type', 'Phone Confidence',
  'Email', 'Email Source URL', 'Email Source Type', 'Email Confidence',
  'Phone Missing Reason', 'Email Missing Reason',
  'Contact Status', 'First Seen', 'Last Checked', 'Data Source'
];

const LOG_HEADERS = [
  'Timestamp', 'Company Number', 'Company Name', 'Stage', 'Status', 'Error', 'Retry Count', 'Source URL'
];

// ---- ENTRY POINT ----
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);

    // 1. Validate secret against Script Properties
    const expectedSecret = getWebhookSecret();
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false, error: 'Unauthorized'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    const action = payload.action || 'sync_companies';

    if (action === 'sync_companies') {
      return handleSyncCompanies(payload);
    } else if (action === 'sync_logs') {
      return handleSyncLogs(payload);
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

// ---- SYNC COMPANIES ----
function handleSyncCompanies(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(COMPANIES_SHEET);

  // Create sheet if missing
  if (!sheet) {
    sheet = ss.insertSheet(COMPANIES_SHEET);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  }

  // Ensure headers exist
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  }

  const companies = payload.companies || [];
  if (companies.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true, inserted: 0, updated: 0
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Build index of existing company numbers -> row number
  const data = sheet.getDataRange().getValues();
  const companyIndex = {};
  for (let i = 1; i < data.length; i++) {
    const cn = String(data[i][0]).trim();
    if (cn) companyIndex[cn] = i + 1; // 1-based row
  }

  let inserted = 0;
  let updated = 0;

  for (const c of companies) {
    const row = companyToRow(c);
    const existingRow = companyIndex[c.company_number];

    if (existingRow) {
      // Update existing row
      sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
      updated++;
    } else {
      // Append new row
      sheet.appendRow(row);
      companyIndex[c.company_number] = sheet.getLastRow();
      inserted++;
    }
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true, inserted: inserted, updated: updated
  })).setMimeType(ContentService.MimeType.JSON);
}

function companyToRow(c) {
  return [
    c.company_number || '',
    c.company_name || '',
    c.date_of_creation || '',
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
    c.phone_missing_reason || '',
    c.email_missing_reason || '',
    c.contact_status || '',
    c.first_seen || '',
    c.last_seen || c.last_checked || '',
    'Companies House'
  ];
}

// ---- SYNC LOGS ----
function handleSyncLogs(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(LOG_SHEET);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS]);
    sheet.getRange(1, 1, 1, LOG_HEADERS.length).setFontWeight('bold');
  }

  const logs = payload.logs || [];
  if (logs.length === 0) {
    return ContentService.createTextOutput(JSON.stringify({
      success: true, count: 0
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // Clear existing logs (keep headers) and rewrite — avoids unbounded growth
  if (sheet.getLastRow() > 1) {
    sheet.getRange(2, 1, sheet.getLastRow() - 1, LOG_HEADERS.length).clearContent();
  }

  const rows = logs.map(function(log) {
    return [
      log.timestamp || '',
      log.company_number || '',
      log.company_name || '',
      log.stage || '',
      log.status || '',
      log.error_message || '',
      log.retry_count || 0,
      log.source_url || ''
    ];
  });

  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, LOG_HEADERS.length).setValues(rows);
  }

  return ContentService.createTextOutput(JSON.stringify({
    success: true, count: rows.length
  })).setMimeType(ContentService.MimeType.JSON);
}

// ---- UPDATE STATISTICS ----
function handleUpdateStats(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(STATS_SHEET);

  if (!sheet) {
    sheet = ss.insertSheet(STATS_SHEET);
  }

  const stats = payload.stats || {};

  const rows = [
    ['Metric', 'Value'],
    ['Total Companies', stats.totalCompanies || 0],
    ['Website Exists', stats.totalWithWebsite || 0],
    ['No Website (enrichment target)', stats.totalNoWebsite || 0],
    ['Companies Checked Today', stats.companiesCheckedToday || 0],
    ['With Website Today', stats.companiesWithWebsiteToday || 0],
    ['No Website Today', stats.noWebsiteAddedToday || 0],
    ['Phone Coverage % (no website)', stats.phoneCoverage || '0%'],
    ['Email Coverage % (no website)', stats.emailCoverage || '0%'],
    ['Phone + Email Coverage % (no website)', stats.phoneEmailCoverage || '0%'],
    ['Phones Found (no website)', stats.phonesFound || 0],
    ['Emails Found (no website)', stats.emailsFound || 0],
    ['Phone + Email Found (no website)', stats.phoneAndEmail || 0],
    ['No Website — No Contact Yet', stats.notYetPublic || 0],
    ['Extraction Failures', stats.extractionFailures || 0],
    ['Processing Errors', stats.failures || 0],
    ['Coverage Note', 'Trend metric — re-enrichment Day 1/3/7/14/30'],
    ['Last Successful Run', stats.lastSuccessfulRun || ''],
    ['Last Attempted Run', stats.lastAttemptedRun || ''],
    ['Database Size (MB)', stats.dbSizeMB || ''],
    ['Database Free-Tier Status', stats.dbStatus || '']
  ];

  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  sheet.getRange(1, 1, 1, 2).setFontWeight('bold');

  return ContentService.createTextOutput(JSON.stringify({
    success: true
  })).setMimeType(ContentService.MimeType.JSON);
}
