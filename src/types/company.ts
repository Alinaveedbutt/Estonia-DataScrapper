export type WebsiteStatus = 'WEBSITE_EXISTS' | 'NO_WEBSITE' | 'PENDING';

export type ContactStatus =
  | 'COMPLETE'
  | 'PARTIAL'
  | 'NOT_YET_PUBLIC'
  | 'NOT_APPLICABLE';

export interface CompanyRecord {
  registry_code: string;
  company_name: string;
  registration_date: string | null;
  company_status: string | null;
  company_status_text: string | null;
  legal_form: string | null;
  address_line: string | null;
  locality: string | null;
  postal_code: string | null;
  country: string;
  full_address: string | null;
  website_status: WebsiteStatus;
  website_url: string | null;
  website_source: string | null;
  phone: string | null;
  phone_type: string | null;
  email: string | null;
  contact_source: string | null;
  contact_status: ContactStatus;
  phone_missing_reason: string | null;
  email_missing_reason: string | null;
  first_seen: string;
  last_checked: string;
  data_source: string;
}

export interface PipelineStats {
  totalCompanies: number;
  totalNoWebsite: number;
  totalWithWebsite: number;
  phonesFound: number;
  emailsFound: number;
  phoneAndEmail: number;
  notYetPublic: number;
  failures: number;
  phoneCoverage: string;
  emailCoverage: string;
  phoneEmailCoverage: string;
  lastSuccessfulRun: string;
  lastAttemptedRun: string;
  scanFrom: string;
  scanTo: string;
  sourceFile: string;
}
