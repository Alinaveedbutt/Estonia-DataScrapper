/**
 * Parse Estonian open-data dates (DD.MM.YYYY or ISO-ish with Z).
 */
export function parseEstonianDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmyDot = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (dmyDot) {
    const day = parseInt(dmyDot[1], 10);
    const month = parseInt(dmyDot[2], 10);
    const year = parseInt(dmyDot[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmySlash = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (dmySlash) {
    const day = parseInt(dmySlash[1], 10);
    const month = parseInt(dmySlash[2], 10);
    const year = parseInt(dmySlash[3], 10);
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = s.replace(/Z$/i, '');
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Registry Date for Sheets: date/month/year → DD/MM/YYYY */
export function formatDdMmYyyy(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Pipeline run timestamp for Sheets (UTC). */
export function formatRunDateTime(d: Date): string {
  const date = formatDdMmYyyy(d);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${date} ${hh}:${mm} UTC`;
}

/** ISO yyyy-MM-dd for internal sorting / checkpoints. */
export function toSheetDate(raw: string | null | undefined): string | null {
  const d = parseEstonianDate(raw);
  return d ? formatIsoDate(d) : null;
}

/** DD/MM/YYYY for the Companies sheet Registry Date column. */
export function toRegistryDisplayDate(raw: string | null | undefined): string {
  const d = parseEstonianDate(raw);
  return d ? formatDdMmYyyy(d) : '';
}
