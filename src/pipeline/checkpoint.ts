import { addDays, format, startOfDay, subDays } from 'date-fns';

export interface ScanDateRange {
  dates: string[];
  scanFrom: Date;
  scanTo: Date;
}

/**
 * Determine which incorporation dates to scan based on the last successful checkpoint.
 * First run scans yesterday only. Subsequent runs fill gaps from checkpoint+1 through yesterday.
 */
export function getScanDateRange(lastSuccessfulScan: Date | null | undefined, now = new Date()): ScanDateRange {
  const yesterday = startOfDay(subDays(now, 1));

  let scanFrom: Date;
  if (lastSuccessfulScan) {
    scanFrom = startOfDay(addDays(lastSuccessfulScan, 1));
  } else {
    scanFrom = yesterday;
  }

  const scanTo = yesterday;

  if (scanFrom > scanTo) {
    return { dates: [], scanFrom, scanTo };
  }

  const dates: string[] = [];
  for (let d = scanFrom; d <= scanTo; d = addDays(d, 1)) {
    dates.push(format(d, 'yyyy-MM-dd'));
  }

  return { dates, scanFrom, scanTo };
}

export function shouldAdvanceCheckpoint(runSucceeded: boolean, lastCompletedDate: Date | null): boolean {
  return runSucceeded && lastCompletedDate !== null;
}
