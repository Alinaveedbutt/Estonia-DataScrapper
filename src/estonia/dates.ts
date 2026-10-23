/**
 * Parse Estonian open-data dates (DD.MM.YYYY or ISO-ish with Z).
 */
export function parseEstonianDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  const dmy = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(s);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    const year = parseInt(dmy[3], 10);
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

export function toSheetDate(raw: string | null | undefined): string | null {
  const d = parseEstonianDate(raw);
  return d ? formatIsoDate(d) : null;
}
