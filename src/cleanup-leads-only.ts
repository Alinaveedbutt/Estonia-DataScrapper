/**
 * One-time cleanup: remove synthetic test data.
 */
import { connectDb, disconnectDb, prisma } from './database/client';

async function main() {
  await connectDb();

  const before = await prisma.company.count();
  console.log(`Before cleanup — companies: ${before}`);

  const syntheticNumbers = ['12345678', '87654321'];
  const deletedSynthetic = await prisma.company.deleteMany({
    where: { company_number: { in: syntheticNumbers } },
  });
  const deletedLogs = await prisma.processingLog.deleteMany({
    where: { company_number: { in: syntheticNumbers } },
  });

  console.log(`Removed ${deletedSynthetic.count} synthetic companies, ${deletedLogs.count} logs`);

  const after = await prisma.company.count();
  console.log(`After cleanup — companies: ${after}`);

  await disconnectDb();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
