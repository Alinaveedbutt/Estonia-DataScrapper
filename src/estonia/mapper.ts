import { CompanyRecord, ContactStatus, WebsiteStatus } from '../types/company';
import { extractContacts, Sidevahend } from './contacts';
import { toSheetDate } from './dates';

export interface RawEstoniaCompany {
  ariregistri_kood?: number | string;
  nimi?: string;
  yldandmed?: {
    esmaregistreerimise_kpv?: string | null;
    staatus?: string | null;
    staatus_tekstina?: string | null;
    oiguslik_vorm_tekstina?: string | null;
    oiguslik_vorm?: string | null;
    aadressid?: Array<{
      tanav_maja_korter?: string | null;
      ehak_nimetus?: string | null;
      postiindeks?: string | null;
      riik_tekstina?: string | null;
      aadress_ads__ads_normaliseeritud_taisaadress?: string | null;
      lopp_kpv?: string | null;
    }>;
    sidevahendid?: Sidevahend[];
  };
}

function pickAddress(raw: RawEstoniaCompany) {
  const addrs = (raw.yldandmed?.aadressid || []).filter((a) => !a.lopp_kpv);
  const a = addrs[0] || raw.yldandmed?.aadressid?.[0];
  if (!a) {
    return {
      address_line: null as string | null,
      locality: null as string | null,
      postal_code: null as string | null,
      country: 'Estonia',
      full_address: null as string | null,
    };
  }
  const full =
    a.aadress_ads__ads_normaliseeritud_taisaadress ||
    [a.tanav_maja_korter, a.ehak_nimetus, a.postiindeks].filter(Boolean).join(', ') ||
    null;
  return {
    address_line: a.tanav_maja_korter || null,
    locality: a.ehak_nimetus || null,
    postal_code: a.postiindeks || null,
    country: a.riik_tekstina || 'Estonia',
    full_address: full,
  };
}

function contactStatus(phone: string | null, email: string | null): ContactStatus {
  if (phone && email) return 'COMPLETE';
  if (phone || email) return 'PARTIAL';
  return 'NOT_YET_PUBLIC';
}

export interface MapOptions {
  websiteStatus: WebsiteStatus;
  websiteUrl: string | null;
  websiteSource: string | null;
  now?: Date;
}

/**
 * Map one open-data company object into the outreach sheet row shape.
 * Contacts come only from official sidevahendid.
 */
export function mapCompany(raw: RawEstoniaCompany, options: MapOptions): CompanyRecord {
  const y = raw.yldandmed || {};
  const contacts = extractContacts(y.sidevahendid);
  const addr = pickAddress(raw);
  const now = (options.now || new Date()).toISOString();
  const registryCode = String(raw.ariregistri_kood ?? '').trim();

  return {
    registry_code: registryCode,
    company_name: String(raw.nimi || '').trim(),
    registration_date: toSheetDate(y.esmaregistreerimise_kpv),
    company_status: y.staatus || null,
    company_status_text: y.staatus_tekstina || null,
    legal_form: y.oiguslik_vorm_tekstina || y.oiguslik_vorm || null,
    ...addr,
    website_status: options.websiteStatus,
    website_url: options.websiteUrl,
    website_source: options.websiteSource,
    phone: contacts.phone,
    email: contacts.email,
    contact_source: contacts.phone || contacts.email ? 'e-Business Register open data' : null,
    contact_status: contactStatus(contacts.phone, contacts.email),
    phone_missing_reason: contacts.phone ? null : 'Not published in register contacts',
    email_missing_reason: contacts.email ? null : 'Not published in register contacts',
    first_seen: now,
    last_checked: now,
    data_source: 'e-Business Register General data (avaandmed.ariregister.rik.ee)',
  };
}

/** Registry WWW from open data, if present. */
export function registryWebsite(raw: RawEstoniaCompany): string | null {
  return extractContacts(raw.yldandmed?.sidevahendid).website;
}
