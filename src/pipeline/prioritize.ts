import { CompanyRecord } from '../types/company';

/**
 * Cold-call ordering:
 * 1) NO_WEBSITE before companies with a website
 * 2) Has phone (callable) before email-only / no contact
 * 3) Has any contact before none
 * 4) Newer registration date
 */
export function prioritizeForOutreach(rows: CompanyRecord[]): CompanyRecord[] {
  return [...rows].sort((a, b) => {
    const webRank = (s: string) => (s === 'NO_WEBSITE' ? 0 : 1);
    const w = webRank(a.website_status) - webRank(b.website_status);
    if (w !== 0) return w;

    const phoneRank = (c: CompanyRecord) => (c.phone ? 0 : 1);
    const p = phoneRank(a) - phoneRank(b);
    if (p !== 0) return p;

    const contactRank = (c: CompanyRecord) => (c.phone || c.email ? 0 : 1);
    const c = contactRank(a) - contactRank(b);
    if (c !== 0) return c;

    return (b.registration_date || '').localeCompare(a.registration_date || '');
  });
}

/** Keep rows useful for outreach when filters are enabled. */
export function filterForSheets(
  rows: CompanyRecord[],
  options: { noWebsiteOnly?: boolean; requireContact?: boolean; requirePhone?: boolean }
): CompanyRecord[] {
  let out = rows;
  if (options.noWebsiteOnly) {
    out = out.filter((r) => r.website_status === 'NO_WEBSITE');
  }
  if (options.requirePhone) {
    out = out.filter((r) => !!r.phone);
  } else if (options.requireContact) {
    out = out.filter((r) => !!(r.phone || r.email));
  }
  return out;
}
