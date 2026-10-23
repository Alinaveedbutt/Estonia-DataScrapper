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
 * Rolling registration window: always the last `lookbackDays` through yesterday.
 * Checkpoint is NOT used to shrink/skip this window — every daily/manual run
 * re-processes the lookback so Sheets can be refilled (upsert).
 */
export function getScanDateRange(
  _lastSuccessfulScan: string | null | undefined = null,
  now = new Date(),
  lookbackDays = config.estonia.lookbackDays
): ScanDateRange {
  const yesterday = startOfDay(subDays(now, 1));
  const days = Math.max(1, lookbackDays);
  const scanFrom = startOfDay(subDays(yesterday, days - 1));
  const scanTo = yesterday;

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

/** Build inclusive date list for an explicit --from/--to window. */
export function rangeFromExplicit(fromDate: string, toDate: string): ScanDateRange {
  const scanFrom = startOfDay(new Date(fromDate + 'T00:00:00Z'));
  const scanTo = startOfDay(new Date(toDate + 'T00:00:00Z'));
  if (Number.isNaN(scanFrom.getTime()) || Number.isNaN(scanTo.getTime()) || scanFrom > scanTo) {
    return { fromDate, toDate, dates: [] };
  }
  const dates: string[] = [];
  for (let d = scanFrom; d <= scanTo; d = addDays(d, 1)) {
    dates.push(format(d, 'yyyy-MM-dd'));
  }
  return { fromDate: format(scanFrom, 'yyyy-MM-dd'), toDate: format(scanTo, 'yyyy-MM-dd'), dates };
}

export function shouldAdvanceCheckpoint(runSucceeded: boolean, hadDates: boolean): boolean {
  return runSucceeded && hadDates;
}
