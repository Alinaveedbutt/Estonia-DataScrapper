import { google, sheets_v4 } from 'googleapis';
import { config } from '../config/env';

let sheetsInstance: sheets_v4.Sheets | null = null;

export async function getGoogleSheetsApi(): Promise<sheets_v4.Sheets | null> {
  if (sheetsInstance) return sheetsInstance;

  if (!config.google.serviceAccountEmail || !config.google.privateKey || !config.google.sheetId) {
    console.warn('[GS] Google Sheets credentials incomplete. Syncing disabled.');
    return null;
  }

  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: config.google.serviceAccountEmail,
        private_key: config.google.privateKey,
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const client = await auth.getClient();
    sheetsInstance = google.sheets({ version: 'v4', auth: client as any });
    console.log('[GS] Google Sheets authorized successfully');
    return sheetsInstance;
  } catch (error: any) {
    console.error('[GS] Authorization failed:', error.message);
    return null;
  }
}

export function getSpreadsheetId(): string {
  return config.google.sheetId;
}

export async function rateLimitedSheetsCall<T>(caller: () => Promise<T>): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await caller();
    } catch (error: any) {
      if (error.code === 429) {
        attempt++;
        if (attempt > 4) {
          console.error('[GS] Quota exceeded repeatedly. Failing safely.');
          throw error;
        }
        const backoff = Math.pow(2, attempt) * 5000;
        console.warn(`[GS] Rate limited by Google (429). Waiting ${backoff/1000}s...`);
        await new Promise(r => setTimeout(r, backoff));
      } else {
        throw error;
      }
    }
  }
}

export async function testGoogleSheetsConnection(): Promise<boolean> {
  try {
    const sheets = await getGoogleSheetsApi();
    if (!sheets) return false;
    await sheets.spreadsheets.get({ spreadsheetId: getSpreadsheetId() });
    return true;
  } catch {
    return false;
  }
}
