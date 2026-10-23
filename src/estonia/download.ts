import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { config } from '../config/env';

const ZIP_NAME = 'ettevotja_rekvisiidid__yldandmed.json.zip';
/** Reuse a cached dump if younger than this (RIK refreshes once per day). */
const MAX_CACHE_AGE_MS = 20 * 60 * 60 * 1000;

export interface DumpLocation {
  zipPath: string;
  downloaded: boolean;
  source: string;
}

function ensureDataDir(): string {
  const dir = config.estonia.dataDir;
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function isFresh(filePath: string): boolean {
  try {
    const age = Date.now() - fs.statSync(filePath).mtimeMs;
    return age >= 0 && age < MAX_CACHE_AGE_MS;
  } catch {
    return false;
  }
}

/**
 * Resolve a General data dump: local path override, fresh cache, or download.
 */
export async function ensureGeneralDataDump(): Promise<DumpLocation> {
  const local = config.estonia.localDumpPath;
  if (local) {
    if (!fs.existsSync(local)) {
      throw new Error(`ESTONIA_LOCAL_DUMP_PATH not found: ${local}`);
    }
    return { zipPath: path.resolve(local), downloaded: false, source: 'local' };
  }

  const dir = ensureDataDir();
  const zipPath = path.join(dir, ZIP_NAME);

  if (fs.existsSync(zipPath) && isFresh(zipPath)) {
    const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
    console.log(`[Estonia] Using cached dump ${zipPath} (${sizeMb} MB)`);
    return { zipPath, downloaded: false, source: `cache:${zipPath}` };
  }

  console.log(`[Estonia] Downloading General data open dump…`);
  console.log(`[Estonia] URL: ${config.estonia.generalDataUrl}`);

  const tmpPath = `${zipPath}.partial`;
  const response = await axios.get(config.estonia.generalDataUrl, {
    responseType: 'stream',
    timeout: 10 * 60 * 1000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    headers: {
      'User-Agent': 'estonia-company-data-pipeline/1.0 (+open-data reuse; attribution to RIK)',
      Accept: 'application/zip,application/octet-stream,*/*',
    },
  });

  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(tmpPath);
    response.data.pipe(out);
    out.on('finish', () => resolve());
    out.on('error', reject);
    response.data.on('error', reject);
  });

  fs.renameSync(tmpPath, zipPath);
  const sizeMb = (fs.statSync(zipPath).size / (1024 * 1024)).toFixed(1);
  console.log(`[Estonia] Saved ${zipPath} (${sizeMb} MB)`);

  return { zipPath, downloaded: true, source: config.estonia.generalDataUrl };
}
