import prisma from '../../../lib/prisma';
import { syncSource, type PostingSourceType } from './sync';

// Dry run of automatic posting on a sample of each source. Every sync runs inside a transaction
// that is rolled back, so nothing (not even parties) is written.

const sampleIds = async (sourceType: PostingSourceType, limit: number): Promise<string[]> => {
  switch (sourceType) {
    case 'SELL_ACCOUNT':
      return (await prisma.sellAccount.findMany({ where: { isDraft: false, deletedAt: null }, orderBy: { updatedAt: 'desc' }, take: limit, select: { id: true } })).map((row) => row.id);
    case 'LISTING_PAYMENT':
      return (await prisma.listingPaymentSubmission.findMany({ where: { status: { in: ['APPROVED', 'PAID'] } }, orderBy: { updatedAt: 'desc' }, take: limit, select: { id: true } })).map((row) => row.id);
    case 'CUSTOMER_PRIME':
      return (await prisma.customerPrimeSubscription.findMany({ where: { status: { in: ['ACTIVE', 'EXPIRED'] } }, orderBy: { updatedAt: 'desc' }, take: limit, select: { id: true } })).map((row) => row.id);
    case 'PARTNER_DEPOSIT':
      return (await prisma.partnerDeposit.findMany({ where: { status: { in: ['VERIFIED', 'REFUND_REQUESTED', 'REFUNDED'] } }, orderBy: { updatedAt: 'desc' }, take: limit, select: { id: true } })).map((row) => row.id);
    case 'API_WALLET_LEDGER':
      return (await prisma.apiWalletLedger.findMany({ where: { type: 'CREDIT' }, orderBy: { createdAt: 'desc' }, take: limit, select: { id: true } })).map((row) => row.id);
    default:
      return [];
  }
};

export const previewPosting = async (limitPerSource = 10) => {
  const accounts = new Map((await prisma.finAccount.findMany({ select: { id: true, code: true, name: true } })).map((account) => [account.id, `${account.code} ${account.name}`]));
  const sources: PostingSourceType[] = ['SELL_ACCOUNT', 'LISTING_PAYMENT', 'CUSTOMER_PRIME', 'PARTNER_DEPOSIT', 'API_WALLET_LEDGER'];
  const report = [];
  for (const sourceType of sources) {
    const ids = await sampleIds(sourceType, limitPerSource);
    const records = [];
    for (const id of ids) {
      try {
        const summary = await syncSource(sourceType, id, { mode: 'LIVE', dryRun: true });
        records.push({
          sourceId: id,
          ok: true,
          created: summary.created,
          reversed: summary.reversed,
          unchanged: summary.unchanged,
          vouchers: summary.vouchers.map((voucher) => ({
            ...voucher,
            lines: voucher.lines.map((line) => ({ account: accounts.get(line.accountId) ?? line.accountId, debit: line.debit, credit: line.credit })),
          })),
        });
      } catch (error) {
        records.push({ sourceId: id, ok: false, error: error instanceof Error ? error.message : String(error) });
      }
    }
    report.push({ sourceType, sampled: ids.length, records });
  }
  return { generatedAt: new Date().toISOString(), report };
};
