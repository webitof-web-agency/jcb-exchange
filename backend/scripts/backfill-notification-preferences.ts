import prisma from '../src/lib/prisma';
import { backfillNotificationPreferences } from '../src/services/notificationPreferenceBackfill.service';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const batchSizeArgument = process.argv.find((argument) => argument.startsWith('--batch-size='));
const parsedBatchSize = batchSizeArgument ? Number(batchSizeArgument.slice('--batch-size='.length)) : undefined;
const batchSize = Number.isFinite(parsedBatchSize) && parsedBatchSize && parsedBatchSize > 0 ? parsedBatchSize : undefined;

const run = async () => {
  const report = await backfillNotificationPreferences(prisma, {
    dryRun: !apply,
    ...(batchSize !== undefined ? { batchSize } : {}),
  });

  console.log(JSON.stringify(report, null, 2));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply to write notification preference rows.');
  }
};

run()
  .catch((error) => {
    console.error('Notification preference backfill failed.', error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
