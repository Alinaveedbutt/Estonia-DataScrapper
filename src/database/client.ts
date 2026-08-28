import { PrismaClient } from '@prisma/client';
import { config } from '../config/env';

export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: config.database.url,
    },
  },
});

export async function connectDb(): Promise<boolean> {
  try {
    await prisma.$connect();
    console.log('[DB] Connected to PostgreSQL');
    return true;
  } catch (error: any) {
    console.error('[DB] Connection failed:', error.message);
    return false;
  }
}

export async function disconnectDb() {
  await prisma.$disconnect();
}

export async function getDbSizeEstimate(): Promise<{ tables: number; logCount: number; sizeBytes: number; safeToContinue: boolean }> {
  try {
    const companyCount = await prisma.company.count();
    const logCount = await prisma.processingLog.count();
    
    // Calculate actual DB size in bytes using raw SQL
    const sizeResult: any = await prisma.$queryRaw`SELECT pg_database_size(current_database()) as size`;
    const sizeBytes = Number(sizeResult[0]?.size || 0);
    
    // Neon Free Tier limit is 500MB. We set a hard fail-safe stop at 400MB.
    const MAX_SAFE_SIZE_BYTES = 400 * 1024 * 1024;
    const safeToContinue = sizeBytes < MAX_SAFE_SIZE_BYTES;

    if (!safeToContinue) {
      console.error(`[CRITICAL] Database size (${(sizeBytes / 1024 / 1024).toFixed(2)} MB) exceeds safe free-tier threshold of 400 MB. Processing halted to prevent billing.`);
    }

    return { tables: companyCount, logCount, sizeBytes, safeToContinue };
  } catch (error: any) {
    console.error('[DB] Failed to estimate size:', error.message);
    // Fail safe: if we can't verify size, don't stop, but return false to be strict? 
    // Actually, if query fails due to permissions, we fallback to row count check (e.g. 100k companies = ~50MB)
    const companyCount = await prisma.company.count().catch(() => 0);
    const safeToContinue = companyCount < 200000;
    return { tables: companyCount, logCount: 0, sizeBytes: 0, safeToContinue };
  }
}

export async function cleanupOldLogs(retentionDays: number) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const result = await prisma.processingLog.deleteMany({
    where: { timestamp: { lt: cutoff } },
  });
  if (result.count > 0) {
    console.log(`[DB] Cleaned up ${result.count} old processing logs`);
  }
}
