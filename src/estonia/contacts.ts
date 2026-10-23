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

const PHONE_TYPES = new Set(['TEL', 'MOB', 'PHONE']);
const EMAIL_TYPES = new Set(['EMAIL', 'E-MAIL', 'MAIL']);
const WEB_TYPES = new Set(['WWW', 'WEB', 'URL', 'HTTP']);

function isActive(c: Sidevahend): boolean {
  return !c.lopp_kpv;
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
 */
export function extractContacts(sidevahendid: Sidevahend[] | null | undefined): ExtractedContacts {
  const list = (sidevahendid || []).filter(isActive);
  let phone: string | null = null;
  let phoneType: string | null = null;
  let email: string | null = null;
  let website: string | null = null;

  for (const c of list) {
    const type = String(c.liik || '')
      .trim()
      .toUpperCase();
    const value = String(c.sisu || '').trim();
    if (!value) continue;

    if (!phone && PHONE_TYPES.has(type)) {
      phone = value;
      phoneType = type;
    } else if (!email && EMAIL_TYPES.has(type)) {
      email = value;
    } else if (!website && WEB_TYPES.has(type)) {
      website = normalizeWebsite(value);
    }
  }

  // Prefer MOB over TEL if both present and phone not yet set from MOB
  if (!phone) {
    for (const c of list) {
      const type = String(c.liik || '')
        .trim()
        .toUpperCase();
      const value = String(c.sisu || '').trim();
      if (type === 'TEL' && value) {
        phone = value;
        phoneType = 'TEL';
        break;
      }
    }
  }

  return { phone, email, website, phoneType };
}
