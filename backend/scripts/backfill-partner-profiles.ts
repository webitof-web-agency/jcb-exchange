import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '../src/lib/prisma';
import { createPartnerBackfillBackup } from '../src/services/partnerLegacyBackfillBackup';
import {
  backfillLegacyPartnerProfiles,
  verifyLegacyPartnerBackfill,
} from '../src/services/partnerLegacyBackfill.service';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const optionValue = (name: string) => {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1).trim();
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1]?.trim() : undefined;
};

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportPath = path.resolve(
  optionValue('--report') || path.join('backups', `partner-backfill-report-${timestamp}.json`),
);
const backupDirectory = path.resolve(optionValue('--backup-dir') || 'backups');

const writeReport = async (report: unknown) => {
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
};

const main = async () => {
  if (!apply) {
    const dryRun = await backfillLegacyPartnerProfiles(prisma, { dryRun: true });
    const result = {
      phase: 11,
      mode: 'DRY_RUN',
      generatedAt: new Date().toISOString(),
      report: dryRun,
      nextStep: 'Review missingState, missingCity and gstProof, then rerun with --apply.',
    };
    await writeReport(result);
    console.log(JSON.stringify({ ...result, reportPath }, null, 2));
    return;
  }

  // The backup is deliberately created before the first write-capable operation.
  const backup = await createPartnerBackfillBackup({
    ...(process.env.DATABASE_URL ? { databaseUrl: process.env.DATABASE_URL } : {}),
    backupDirectory,
  });
  const applied = await backfillLegacyPartnerProfiles(prisma, { dryRun: false });
  const verification = await verifyLegacyPartnerBackfill(prisma);
  const idempotency = await verifyLegacyPartnerBackfill(prisma);
  const result = {
    phase: 11,
    mode: 'APPLY',
    generatedAt: new Date().toISOString(),
    backup,
    applied,
    verification,
    idempotency: {
      passed: idempotency.passed,
      pendingCanonicalUpdates: idempotency.pendingCanonicalUpdates,
      invalidProofLinks: idempotency.invalidProofLinks,
    },
    reportPath,
  };
  await writeReport(result);
  console.log(JSON.stringify(result, null, 2));

  if (!verification.passed || !idempotency.passed) {
    throw new Error(`Partner backfill verification failed. Review ${reportPath}.`);
  }
};

main()
  .catch((error) => {
    console.error('Partner legacy backfill failed.', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
