// ============================================================
// Google Apps Script — Estonia Company Pipeline Webhook Receiver
// ============================================================
// Deploy as Web App (Execute as: Me, Who has access: Anyone).
// Script Property: WEBHOOK_SECRET
//
// Companies sheet: rolling 7-day cold-call leads (NO WEBSITE + phone).
// After each sync, rows older than 7 days (by Registry Date OR Run Date) are deleted.
//
// Phone numbers like +372… MUST be written as plain text — otherwise Sheets
// treats leading "+" as a formula and shows #ERROR!
// ============================================================

function getWebhookSecret() {
  return PropertiesService.getScriptProperties().getProperty('WEBHOOK_SECRET') || '';
}

const COMPANIES_SHEET = 'Companies';
const RETENTION_DAYS = 7;

// Column order MUST match pipeline SheetsCompanyRow
const COMPANY_HEADERS = [
  'Daily pipeline Run Date',
  'Registry Code',
  "Company's Name",
  'Registry Date',
  'Website Status',
  'Email',
  'Phone Number'
];

const COL_RUN_DATE = 0;
const COL_REGISTRY_CODE = 1;
const COL_REGISTRY_DATE = 3;
const COL_PHONE = 6; // "Phone Number" (1-based column = 7)

/**
 * Force Sheets to treat a value as plain text (not a formula / number).
 * Values starting with +, =, @, or - get a leading apostrophe (hidden in UI).
 */
function asPlainText(value) {
  if (value === null || value === undefined) return '';
  var s = String(value);
  if (!s) return '';
  // Already marked as text from a previous write
  if (s.charAt(0) === "'") return s;
  var first = s.charAt(0);
  if (first === '+' || first === '=' || first === '@' || first === '-') {
    return "'" + s;
  }
  return s;
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const expectedSecret = getWebhookSecret();
    if (!expectedSecret || payload.secret !== expectedSecret) {
      return jsonOut({ success: false, error: 'Unauthorized' });
    }

    const action = payload.action || 'sync_companies';
    if (action === 'sync_companies') return handleSyncCompanies(payload);
    if (action === 'health') return jsonOut({ success: true, message: 'Healthy' });
    if (action === 'update_stats') return jsonOut({ success: true });

    return jsonOut({ success: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return jsonOut({ success: false, error: 'Server error: ' + err.message });
  }
}

function ensureCompaniesSheet(ss) {
  var sheet = ss.getSheetByName(COMPANIES_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(COMPANIES_SHEET);
  }

  // Migrate: if headers don't match the 7-column layout, wipe and reset.
  var needsReset = false;
  if (sheet.getLastRow() === 0) {
    needsReset = true;
  } else {
    var existing = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), COMPANY_HEADERS.length)).getValues()[0];
    for (var i = 0; i < COMPANY_HEADERS.length; i++) {
      if (String(existing[i] || '').trim() !== COMPANY_HEADERS[i]) {
        needsReset = true;
        break;
      }
    }
    if (sheet.getLastColumn() > COMPANY_HEADERS.length) needsReset = true;
  }

  if (needsReset) {
    sheet.clear();
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setValues([COMPANY_HEADERS]);
    sheet.getRange(1, 1, 1, COMPANY_HEADERS.length).setFontWeight('bold');
  }

  formatTextColumns(sheet);
  return sheet;
}

/** Phone Number + Registry Code columns as plain text (@). */
function formatTextColumns(sheet) {
  // Entire columns (generous range) so future appends stay text
  sheet.getRange(2, COL_PHONE + 1, 5000, 1).setNumberFormat('@');
  sheet.getRange(2, COL_REGISTRY_CODE + 1, 5000, 1).setNumberFormat('@');
}

function handleSyncCompanies(payload) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ensureCompaniesSheet(ss);

  var companies = payload.companies || [];
  var inserted = 0;
  var updated = 0;

  if (companies.length > 0) {
    var data = sheet.getDataRange().getValues();
    var companyIndex = {};
    for (var i = 1; i < data.length; i++) {
      var code = String(data[i][COL_REGISTRY_CODE] || '').trim();
      if (code) companyIndex[code] = i + 1;
    }

    for (var c = 0; c < companies.length; c++) {
      var company = companies[c];
      var row = companyToRow(company);
      var key = String(company.registry_code || '').trim();
      if (!key) continue;

      var existingRow = companyIndex[key];
      if (existingRow) {
        var range = sheet.getRange(existingRow, 1, 1, row.length);
        range.setNumberFormats([['@', '@', '@', '@', '@', '@', '@']]);
        range.setValues([row]);
        updated++;
      } else {
        sheet.appendRow(row);
        var newRow = sheet.getLastRow();
        sheet.getRange(newRow, 1, 1, row.length).setNumberFormats([['@', '@', '@', '@', '@', '@', '@']]);
        // Re-apply values after format so +phone stays text (appendRow can still formula-parse)
        sheet.getRange(newRow, 1, 1, row.length).setValues([row]);
        companyIndex[key] = newRow;
        inserted++;
      }
    }

    formatTextColumns(sheet);
  }

  var purged = purgeOldRows(sheet);

  return jsonOut({
    success: true,
    inserted: inserted,
    updated: updated,
    purged: purged
  });
}

function companyToRow(c) {
  return [
    c.run_date || '',
    asPlainText(c.registry_code || ''),
    c.company_name || '',
    c.registry_date || '',
    c.website_status || '',
    c.email || '',
    // Keep leading + for dialing; asPlainText prevents Sheets #ERROR! formula parse
    asPlainText(c.phone || '')
  ];
}

/**
 * Delete data rows where Registry Date OR Daily pipeline Run Date
 * is more than RETENTION_DAYS before today (rolling week of leads).
 */
function purgeOldRows(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  var cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  var numDataRows = lastRow - 1;
  var values = sheet.getRange(2, 1, numDataRows, COMPANY_HEADERS.length).getValues();
  var purged = 0;

  for (var i = values.length - 1; i >= 0; i--) {
    var runDate = parseSheetDate(values[i][COL_RUN_DATE]);
    var registryDate = parseSheetDate(values[i][COL_REGISTRY_DATE]);
    var stale =
      (runDate && runDate < cutoff) ||
      (registryDate && registryDate < cutoff);

    if (stale) {
      sheet.deleteRow(i + 2);
      purged++;
    }
  }

  return purged;
}

function parseSheetDate(value) {
  if (!value) return null;
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    var d = new Date(value.getTime());
    d.setHours(0, 0, 0, 0);
    return d;
  }
  var s = String(value).trim();
  var m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!m) return null;
  var day = parseInt(m[1], 10);
  var month = parseInt(m[2], 10) - 1;
  var year = parseInt(m[3], 10);
  var parsed = new Date(year, month, day);
  parsed.setHours(0, 0, 0, 0);
  return isNaN(parsed.getTime()) ? null : parsed;
}
