import type { FinVoucherType, Prisma } from '@prisma/client';
import { badRequest } from '../http';
import { periodPostingError, validateVoucher, type VoucherLineInput } from './ledgerRules';
import { assignNumber, lineRows, loadReferences, resolvePeriod, type LedgerAccess } from './ledger.service';

/**
 * Posts a voucher created by a workspace action (settlement, gateway settlement, depreciation,
 * payroll…) straight into the books. The action's own screen is the approval step, so the
 * voucher policy is not applied; the voucher carries sourceType/sourceId back to that record.
 */
export const postSystemVoucher = async (
  tx: Prisma.TransactionClient,
  input: {
    type: FinVoucherType;
    date: Date;
    narration: string;
    reference?: string | null;
    paymentMethod?: string | null;
    partyId?: string | null;
    sellAccountId?: string | null;
    lines: VoucherLineInput[];
    sourceType: string;
    sourceId: string;
    sourceEvent: string;
    /** Unique key that makes the same action impossible to post twice. */
    idempotencyKey?: string | null;
  },
  access: LedgerAccess,
) => {
  const period = await resolvePeriod(tx, input.date);
  const error = periodPostingError(period, access.canPostSoftClosed);
  if (error) throw badRequest(error);
  const header = { partyId: input.partyId ?? null, costCentreId: null, sellAccountId: input.sellAccountId ?? null };
  const refs = await loadReferences(tx, { lines: input.lines, ...header });
  const total = validateVoucher({ type: input.type, lines: input.lines, narration: input.narration, ...header }, refs, { manual: false });
  const number = await assignNumber(tx, input.type, period.year);
  const now = new Date();
  const voucher = await tx.finVoucher.create({
    data: {
      number, type: input.type, date: input.date, yearId: period.yearId, periodId: period.id, status: 'POSTED', narration: input.narration,
      reference: input.reference ?? null, paymentMethod: input.paymentMethod ?? null, partyId: header.partyId, sellAccountId: header.sellAccountId, totalAmount: total,
      sourceType: input.sourceType, sourceId: input.sourceId, sourceEvent: input.sourceEvent, idempotencyKey: input.idempotencyKey ?? null,
      createdById: access.actor.actorUserId, postedById: access.actor.actorUserId, postedAt: now,
      lines: { create: lineRows(input.lines) },
    },
  });
  return { id: voucher.id, number };
};

/** Shorthand for a voucher line. */
export const vline = (accountId: string, debit: Prisma.Decimal, credit: Prisma.Decimal, extra: Partial<VoucherLineInput> = {}): VoucherLineInput => ({
  accountId, partyId: null, sellAccountId: null, costCentreId: null, debit, credit, narration: null, billRef: null, ...extra,
});
