export interface Sidevahend {
  liik?: string | null;
  liik_tekstina?: string | null;
  sisu?: string | null;
  lopp_kpv?: string | null;
}

export interface ExtractedContacts {
  phone: string | null;
  email: string | null;
  website: string | null;
  phoneType: string | null;
}

const PHONE_TYPES = new Set(['TEL', 'MOB', 'PHONE', 'TELEFON']);
const EMAIL_TYPES = new Set(['EMAIL', 'E-MAIL', 'MAIL']);
const WEB_TYPES = new Set(['WWW', 'WEB', 'URL', 'HTTP']);

function isActive(c: Sidevahend): boolean {
  return !c.lopp_kpv;
}

function normalizeType(raw: string | null | undefined): string {
  return String(raw || '')
    .trim()
    .toUpperCase();
}

function normalizeWebsite(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Extract official phone, email, and website from register contact channels.
 * Does not invent or guess — only uses published sidevahendid values.
 * Phone is first-class for cold-call: prefers MOB, then TEL/PHONE.
 */
export function extractContacts(sidevahendid: Sidevahend[] | null | undefined): ExtractedContacts {
  const list = (sidevahendid || []).filter(isActive);

  let email: string | null = null;
  let website: string | null = null;
  let mob: { value: string; type: string } | null = null;
  let tel: { value: string; type: string } | null = null;

  for (const c of list) {
    const type = normalizeType(c.liik);
    const value = String(c.sisu || '').trim();
    if (!value) continue;

    if (PHONE_TYPES.has(type)) {
      if (type === 'MOB' && !mob) mob = { value, type };
      else if (!tel) tel = { value, type };
    } else if (!email && EMAIL_TYPES.has(type)) {
      email = value;
    } else if (!website && WEB_TYPES.has(type)) {
      website = normalizeWebsite(value);
    }
  }

  const chosen = mob || tel;
  return {
    phone: chosen?.value || null,
    phoneType: chosen?.type || null,
    email,
    website,
  };
}
