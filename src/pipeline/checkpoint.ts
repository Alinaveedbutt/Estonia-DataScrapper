import { addDays, format, startOfDay, subDays } from 'date-fns';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

export interface ScanDateRange {
  fromDate: string;
  toDate: string;
  dates: string[];
}

export interface PipelineStateFile {
  last_successful_scan: string | null;
  last_attempted_scan: string | null;
  updated_at: string;
}

function statePath(): string {
  return path.join(config.estonia.dataDir, 'pipeline-state.json');
}

export function loadPipelineState(): PipelineStateFile {
  const p = statePath();
  if (!fs.existsSync(p)) {
    return { last_successful_scan: null, last_attempted_scan: null, updated_at: new Date().toISOString() };
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8')) as PipelineStateFile;
  } catch {
    return { last_successful_scan: null, last_attempted_scan: null, updated_at: new Date().toISOString() };
  }
}

export function savePipelineState(state: PipelineStateFile): void {
  fs.mkdirSync(config.estonia.dataDir, { recursive: true });
  fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8');
}

/**
 * Date window for newly registered companies.
 * First run: last ESTONIA_LOOKBACK_DAYS through yesterday.
 * Later runs: day after last successful scan through yesterday.
 */
export function getScanDateRange(
  lastSuccessfulScan: string | null | undefined,
  now = new Date(),
  lookbackDays = config.estonia.lookbackDays
): ScanDateRange {
  const yesterday = startOfDay(subDays(now, 1));
  let scanFrom: Date;

  if (lastSuccessfulScan) {
    scanFrom = startOfDay(addDays(new Date(lastSuccessfulScan), 1));
  } else {
    scanFrom = startOfDay(subDays(yesterday, Math.max(0, lookbackDays - 1)));
  }

  const scanTo = yesterday;

  if (scanFrom > scanTo) {
    return { fromDate: format(scanFrom, 'yyyy-MM-dd'), toDate: format(scanTo, 'yyyy-MM-dd'), dates: [] };
  }

  const dates: string[] = [];
  for (let d = scanFrom; d <= scanTo; d = addDays(d, 1)) {
    dates.push(format(d, 'yyyy-MM-dd'));
  }

  return {
    fromDate: format(scanFrom, 'yyyy-MM-dd'),
    toDate: format(scanTo, 'yyyy-MM-dd'),
    dates,
  };
}

export function shouldAdvanceCheckpoint(runSucceeded: boolean, hadDates: boolean): boolean {
  return runSucceeded && hadDates;
}
