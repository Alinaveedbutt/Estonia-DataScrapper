import { formatRunDateTime, toRegistryDisplayDate } from '../estonia/dates';
import { CompanyRecord } from '../types/company';

/** Exact Companies sheet payload (7 columns). */
export interface SheetsCompanyRow {
  run_date: string;
  registry_code: string;
  company_name: string;
  registry_date: string;
  website_status: 'Yes' | 'No';
  email: string;
  phone: string;
}

export function websiteStatusYesNo(status: CompanyRecord['website_status']): 'Yes' | 'No' {
  return status === 'WEBSITE_EXISTS' ? 'Yes' : 'No';
}

/**
 * Map an internal company record to the slim Sheets row.
 * registry_date uses DD/MM/YYYY; website_status is Yes/No.
 */
export function toSheetsRow(company: CompanyRecord, runAt: Date = new Date()): SheetsCompanyRow {
  return {
    run_date: formatRunDateTime(runAt),
    registry_code: company.registry_code || '',
    company_name: company.company_name || '',
    registry_date: toRegistryDisplayDate(company.registration_date),
    website_status: websiteStatusYesNo(company.website_status),
    email: company.email || '',
    phone: company.phone || '',
  };
}
