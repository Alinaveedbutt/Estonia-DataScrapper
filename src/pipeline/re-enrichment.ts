import { differenceInDays } from 'date-fns';
import { Company } from '@prisma/client';

export function parseReEnrichmentSchedule(raw: string): number[] {
  const days = raw
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 0);

  return days.length > 0 ? days : [1, 3, 7, 14, 30];
}

export function isCompanyIncomplete(company: Pick<Company, 'phone' | 'email'>): boolean {
  return !company.phone || !company.email;
}

export function isEligibleForReEnrichment(
  company: Pick<Company, 'phone' | 'email' | 'enrichment_attempts' | 'first_seen' | 'last_enrichment_attempt'>,
  schedule: number[],
  now = new Date()
): boolean {
  if (!isCompanyIncomplete(company)) return false;
  if (company.enrichment_attempts >= schedule.length) return false;

  const daysSinceFirstSeen = differenceInDays(now, company.first_seen);
  const nextIndex = company.enrichment_attempts;
  const requiredDays = schedule[nextIndex];

  if (daysSinceFirstSeen < requiredDays) return false;

  if (company.last_enrichment_attempt) {
    const daysSinceLast = differenceInDays(now, company.last_enrichment_attempt);
    if (daysSinceLast < 1) return false;
  }

  return true;
}
