import fs from 'fs';
import path from 'path';
import { parser as jsonParser } from 'stream-json';
import { streamArray } from 'stream-json/streamers/StreamArray';
import { chain } from 'stream-chain';
import unzipper from 'unzipper';
import { parseEstonianDate, formatIsoDate } from './dates';
import { RawEstoniaCompany } from './mapper';

export interface ParseFilter {
  /** Inclusive ISO dates yyyy-MM-dd */
  fromDate: string;
  toDate: string;
  maxCompanies?: number;
}

export interface ParseResult {
  companies: RawEstoniaCompany[];
  scanned: number;
  matched: number;
  sourceMember: string;
}

async function openJsonStream(
  dumpPath: string
): Promise<{ stream: NodeJS.ReadableStream; member: string }> {
  const lower = dumpPath.toLowerCase();
  if (lower.endsWith('.zip')) {
    const directory = await unzipper.Open.file(dumpPath);
    const file = directory.files.find((f) => f.path.toLowerCase().endsWith('.json'));
    if (!file) {
      throw new Error(`No .json member found in zip: ${dumpPath}`);
    }
    return { stream: file.stream(), member: file.path };
  }

  return { stream: fs.createReadStream(dumpPath), member: path.basename(dumpPath) };
}

/**
 * Stream-parse the General data dump and keep companies whose first-entry date
 * falls in [fromDate, toDate]. Does not load the full ~4GB JSON into memory.
 */
export async function parseNewCompanies(
  dumpPath: string,
  filter: ParseFilter
): Promise<ParseResult> {
  const from = new Date(filter.fromDate + 'T00:00:00Z');
  const to = new Date(filter.toDate + 'T23:59:59Z');
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error(`Invalid date filter: ${filter.fromDate} .. ${filter.toDate}`);
  }

  const { stream, member } = await openJsonStream(dumpPath);
  const companies: RawEstoniaCompany[] = [];
  let scanned = 0;
  let matched = 0;

  await new Promise<void>((resolve, reject) => {
    const pipeline = chain([stream, jsonParser(), streamArray()]);

    pipeline.on('data', ({ value }: { value: RawEstoniaCompany }) => {
      scanned += 1;
      if (scanned % 50000 === 0) {
        console.log(`[Estonia] Scanned ${scanned} companies… (matched ${matched})`);
      }

      const rawDate = value?.yldandmed?.esmaregistreerimise_kpv;
      const d = parseEstonianDate(rawDate);
      if (!d) return;
      if (d < from || d > to) return;

      matched += 1;
      if (filter.maxCompanies && companies.length >= filter.maxCompanies) {
        return;
      }
      companies.push(value);
    });

    pipeline.on('end', () => resolve());
    pipeline.on('error', (err: Error) => reject(err));
  });

  companies.sort((a, b) => {
    const da = parseEstonianDate(a.yldandmed?.esmaregistreerimise_kpv)?.getTime() || 0;
    const db = parseEstonianDate(b.yldandmed?.esmaregistreerimise_kpv)?.getTime() || 0;
    return db - da;
  });

  if (filter.maxCompanies && companies.length > filter.maxCompanies) {
    companies.length = filter.maxCompanies;
  }

  console.log(
    `[Estonia] Parse done — scanned ${scanned}, matched ${matched}, kept ${companies.length}` +
      ` (${formatIsoDate(from)} .. ${formatIsoDate(to)})`
  );

  return { companies, scanned, matched, sourceMember: member };
}
