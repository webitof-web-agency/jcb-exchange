import { FinDocumentType, FinNoteReason, FinVoucherType, Prisma } from '@prisma/client';
import prisma from '../../../lib/prisma';
import { badRequest, conflict, FinHttpError, notFound } from '../http';
import { readBoolean, readDate, readEnum, readMoney, readMultiline, readRate, readString } from '../utils/input';
import { roundMoney, sumMoney } from '../utils/money';
import { writeFinAudit } from './audit.service';
import { CASH_BANK_KINDS, periodPostingError, validateVoucher, type VoucherLineInput } from './ledgerRules';
import { assignNumber, lineRows, loadReferences, lockedInclude, resolvePeriod, reverseInTx, type LedgerAccess } from './ledger.service';

// Purchase bills, other sales invoices and credit/debit notes. A document is a draft until it is
// posted; posting creates one voucher (sourceType DOCUMENT) and cancelling reverses it.

const ZERO = new Prisma.Decimal(0);
const D = (value: Prisma.Decimal | number | string | null | undefined) => roundMoney(new Prisma.Decimal(value ?? 0));

export const DOCUMENT_VOUCHER_TYPE: Record<FinDocumentType, FinVoucherType> = {
  PURCHASE_BILL: 'PURCHASE',
  SALES_INVOICE: 'SALES',
  CREDIT_NOTE: 'CREDIT_NOTE',
  DEBIT_NOTE: 'DEBIT_NOTE',
};

/** Purchase side documents are against suppliers; sales side against customers. */
export const isPurchaseSide = (type: FinDocumentType) => type === 'PURCHASE_BILL' || type === 'DEBIT_NOTE';

export type DocumentLineInput = {
  description: string;
  accountId: string;
  hsnSac: string | null;
  quantity: Prisma.Decimal;
  rate: Prisma.Decimal;
  discount: Prisma.Decimal;
  gstRate: Prisma.Decimal;
  itcEligible: boolean;
  sellAccountId: string | null;
  costCentreId: string | null;
};

export type ComputedLine = DocumentLineInput & { taxableValue: Prisma.Decimal; cgst: Prisma.Decimal; sgst: Prisma.Decimal; igst: Prisma.Decimal };

/** Taxable value and GST per line; intra-state splits CGST/SGST, inter-state charges IGST. */
export const computeDocument = (lines: DocumentLineInput[], options: { intraState: boolean; roundOff: Prisma.Decimal; tdsAmount: Prisma.Decimal; reverseCharge: boolean }) => {
  const computed: ComputedLine[] = lines.map((line) => {
    const taxableValue = roundMoney(line.quantity.times(line.rate).minus(line.discount));
    const tax = taxableValue.times(line.gstRate).dividedBy(100);
    const cgst = options.intraState ? roundMoney(tax.dividedBy(2)) : ZERO;
    const sgst = options.intraState ? roundMoney(tax.dividedBy(2)) : ZERO;
    const igst = options.intraState ? ZERO : roundMoney(tax);
    return { ...line, taxableValue, cgst, sgst, igst };
  });
  const subTotal = sumMoney(computed.map((line) => line.taxableValue));
  const cgst = sumMoney(computed.map((line) => line.cgst));
  const sgst = sumMoney(computed.map((line) => line.sgst));
  const igst = sumMoney(computed.map((line) => line.igst));
  const tax = cgst.plus(sgst).plus(igst);
  // Under reverse charge the supplier is paid the taxable value only; we pay the GST ourselves.
  const total = roundMoney(subTotal.plus(options.reverseCharge ? ZERO : tax).plus(options.roundOff));
  return { lines: computed, subTotal, cgst, sgst, igst, tax, total, payable: roundMoney(total.minus(options.tdsAmount)) };
};

type SystemAccounts = (key: string) => string;

/** Voucher lines for a computed document (pure). */
export const documentVoucherLines = (
  docType: FinDocumentType,
  computed: ReturnType<typeof computeDocument>,
  context: { partyId: string; reverseCharge: boolean; tdsAmount: Prisma.Decimal; roundOff: Prisma.Decimal; system: SystemAccounts },
): VoucherLineInput[] => {
  const { system, partyId } = context;
  const make = (accountId: string, debit: Prisma.Decimal, credit: Prisma.Decimal, extra: Partial<VoucherLineInput> = {}): VoucherLineInput => ({
    accountId, partyId: null, sellAccountId: null, costCentreId: null, debit: D(debit), credit: D(credit), narration: null, billRef: null, ...extra,
  });
  const lines: VoucherLineInput[] = [];
  const purchaseSide = isPurchaseSide(docType);
  const inbound = docType === 'PURCHASE_BILL' || docType === 'CREDIT_NOTE'; // ledger lines are debits

  // Ledger lines; on the purchase side GST without input credit becomes part of the cost.
  const eligibleTax = { cgst: ZERO, sgst: ZERO, igst: ZERO };
  for (const line of computed.lines) {
    const lineTax = line.cgst.plus(line.sgst).plus(line.igst);
    const claim = !purchaseSide || line.itcEligible;
    if (claim) {
      eligibleTax.cgst = eligibleTax.cgst.plus(line.cgst);
      eligibleTax.sgst = eligibleTax.sgst.plus(line.sgst);
      eligibleTax.igst = eligibleTax.igst.plus(line.igst);
    }
    const amount = line.taxableValue.plus(claim ? ZERO : lineTax);
    lines.push(make(line.accountId, inbound ? amount : ZERO, inbound ? ZERO : amount, { sellAccountId: line.sellAccountId, costCentreId: line.costCentreId, narration: line.description.slice(0, 300) }));
  }

  const taxKeys = purchaseSide
    ? (['GST_INPUT_CGST', 'GST_INPUT_SGST', 'GST_INPUT_IGST'] as const)
    : (['GST_OUTPUT_CGST', 'GST_OUTPUT_SGST', 'GST_OUTPUT_IGST'] as const);
  [eligibleTax.cgst, eligibleTax.sgst, eligibleTax.igst].forEach((amount, index) => {
    if (!amount.greaterThan(0)) return;
    lines.push(make(system(taxKeys[index]!), inbound ? amount : ZERO, inbound ? ZERO : amount, { narration: 'GST' }));
  });

  const counterKey = purchaseSide ? 'CREDITORS_CONTROL' : 'DEBTORS_CONTROL';
  if (context.reverseCharge && docType === 'PURCHASE_BILL') {
    // We owe the whole tax under reverse charge, whether or not the credit can be claimed.
    const rcm = computed.tax;
    if (rcm.greaterThan(0)) lines.push(make(system('GST_RCM_PAYABLE'), ZERO, rcm, { narration: 'GST payable under reverse charge' }));
  }
  if (context.tdsAmount.greaterThan(0)) lines.push(make(system('TDS_PAYABLE'), ZERO, context.tdsAmount, { partyId, narration: 'TDS deducted' }));
  const counterAmount = computed.total.minus(context.tdsAmount);
  if (counterAmount.greaterThan(0)) lines.push(make(system(counterKey), inbound ? ZERO : counterAmount, inbound ? counterAmount : ZERO, { partyId }));
  if (!context.roundOff.isZero()) {
    // Round-off sits on the ledger side so the voucher balances to the rounded total.
    const debitSide = inbound ? context.roundOff.greaterThan(0) : context.roundOff.lessThan(0);
    lines.push(make(system('ROUND_OFF'), debitSide ? context.roundOff.abs() : ZERO, debitSide ? ZERO : context.roundOff.abs(), { narration: 'Round off' }));
  }
  return lines;
};

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const readLines = (body: Record<string, unknown>) => {
  const raw = Array.isArray(body.lines) ? body.lines : null;
  if (!raw || !raw.length) throw badRequest('Add at least one line.');
  if (raw.length > 100) throw badRequest('Up to 100 lines per document.');
  return raw.map((item, index): DocumentLineInput => {
    const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    const at = `Line ${index + 1}`;
    const quantity = readMoney(row, 'quantity', `${at}: quantity`) ?? new Prisma.Decimal(1);
    if (!quantity.greaterThan(0)) throw badRequest(`${at}: quantity must be more than zero.`);
    const hsnSac = readString(row, 'hsnSac', `${at}: HSN/SAC`, { max: 10 });
    if (hsnSac && !/^[0-9]{4,8}$/.test(hsnSac)) throw badRequest(`${at}: HSN/SAC must be 4 to 8 digits.`);
    return {
      description: readString(row, 'description', `${at}: description`, { max: 300, required: true })!,
      accountId: readString(row, 'accountId', `${at}: ledger`, { max: 60, required: true })!,
      hsnSac,
      quantity,
      rate: readMoney(row, 'rate', `${at}: rate`) ?? ZERO,
      discount: readMoney(row, 'discount', `${at}: discount`) ?? ZERO,
      gstRate: readRate(row, 'gstRate', `${at}: GST rate`) ?? ZERO,
      itcEligible: readBoolean(row, 'itcEligible', true),
      sellAccountId: readString(row, 'sellAccountId', `${at}: vehicle`, { max: 60 }),
      costCentreId: readString(row, 'costCentreId', `${at}: cost centre`, { max: 60 }),
    };
  });
};

const readDocumentInput = (body: Record<string, unknown>, allowedTypes: readonly FinDocumentType[]) => {
  const docType = readEnum(body, 'docType', 'Document type', allowedTypes);
  const reverseCharge = docType === 'PURCHASE_BILL' && readBoolean(body, 'isReverseCharge', false);
  const tdsAmount = docType === 'PURCHASE_BILL' ? readMoney(body, 'tdsAmount', 'TDS amount') ?? ZERO : ZERO;
  const placeOfSupply = readString(body, 'placeOfSupply', 'Place of supply', { max: 2 });
  if (placeOfSupply && !/^[0-9]{2}$/.test(placeOfSupply)) throw badRequest('Place of supply must be a 2-digit GST state code.');
  const date = readDate(body, 'date', 'Document date', true)!;
  const dueDate = readDate(body, 'dueDate', 'Due date');
  if (dueDate && dueDate < date) throw badRequest('Due date is before the document date.');
  const isNote = docType === 'CREDIT_NOTE' || docType === 'DEBIT_NOTE';
  return {
    docType,
    date,
    dueDate,
    partyId: readString(body, 'partyId', 'Party', { max: 60, required: true })!,
    partyDocNumber: readString(body, 'partyDocNumber', docType === 'PURCHASE_BILL' ? 'Supplier bill number' : 'Party reference', { max: 60, required: docType === 'PURCHASE_BILL' })?.toUpperCase() ?? null,
    placeOfSupply,
    isReverseCharge: reverseCharge,
    reason: isNote ? readEnum(body, 'reason', 'Reason', Object.values(FinNoteReason), 'OTHER') : null,
    againstDocumentId: isNote ? readString(body, 'againstDocumentId', 'Original document', { max: 60 }) : null,
    againstReference: isNote ? readString(body, 'againstReference', 'Original invoice / bill number', { max: 80 })?.toUpperCase() ?? null : null,
    sellAccountId: readString(body, 'sellAccountId', 'Vehicle', { max: 60 }),
    notes: readMultiline(body, 'notes', 'Notes', 1000),
    tdsSection: tdsAmount.greaterThan(0) ? readString(body, 'tdsSection', 'TDS section', { max: 10, required: true })!.toUpperCase() : null,
    tdsAmount,
    roundOff: readMoney(body, 'roundOff', 'Round off', { allowNegative: true }) ?? ZERO,
    lines: readLines(body),
  };
};

type DocumentInput = ReturnType<typeof readDocumentInput>;

const companyStateCode = async (tx: Prisma.TransactionClient) => {
  const registration = await tx.finGstRegistration.findFirst({ where: { isDefault: true, isActive: true } });
  if (registration) return registration.stateCode;
  return (await tx.finCompanyProfile.findUnique({ where: { id: 'default' } }))?.stateCode ?? null;
};

/** Validates references and works out totals; shared by create, update and post. */
const prepare = async (tx: Prisma.TransactionClient, input: DocumentInput, excludeId?: string) => {
  const party = await tx.finParty.findUnique({ where: { id: input.partyId } });
  if (!party || !party.isActive) throw badRequest('Party not found or inactive.');
  if (input.lines.some((line) => line.rate.isNegative() || line.discount.greaterThan(line.quantity.times(line.rate)))) {
    throw badRequest('A line discount cannot be more than the line value.');
  }
  const accountIds = Array.from(new Set(input.lines.map((line) => line.accountId)));
  const accounts = await tx.finAccount.findMany({ where: { id: { in: accountIds } }, select: { id: true, name: true, kind: true, isActive: true, allowManualPosting: true } });
  for (const line of input.lines) {
    const account = accounts.find((item) => item.id === line.accountId);
    if (!account || !account.isActive) throw badRequest(`Ledger for "${line.description}" was not found or is inactive.`);
    if (!account.allowManualPosting) throw badRequest(`${account.name} is posted automatically and cannot be used on a document line.`);
    if (CASH_BANK_KINDS.includes(account.kind)) throw badRequest(`${account.name} is a bank/cash ledger; record payments as payment or receipt vouchers.`);
  }
  if (input.docType === 'PURCHASE_BILL' && input.partyDocNumber) {
    const duplicate = await tx.finDocument.findFirst({
      where: { docType: 'PURCHASE_BILL', partyId: input.partyId, partyDocNumber: input.partyDocNumber, status: { not: 'CANCELLED' }, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
      select: { number: true },
    });
    if (duplicate) throw conflict(`Supplier bill ${input.partyDocNumber} is already entered for this supplier${duplicate.number ? ` (${duplicate.number})` : ''}.`);
  }
  if (input.againstDocumentId) {
    const original = await tx.finDocument.findUnique({ where: { id: input.againstDocumentId }, select: { partyId: true, docType: true, status: true } });
    const expected = input.docType === 'CREDIT_NOTE' ? 'SALES_INVOICE' : 'PURCHASE_BILL';
    if (!original || original.status !== 'POSTED' || original.docType !== expected || original.partyId !== input.partyId) {
      throw badRequest(`The original document must be a posted ${expected === 'SALES_INVOICE' ? 'sales invoice' : 'purchase bill'} of the same party.`);
    }
  }
  const companyState = await companyStateCode(tx);
  const placeOfSupply = input.placeOfSupply ?? party.stateCode ?? companyState;
  const intraState = !companyState || !placeOfSupply || companyState === placeOfSupply;
  const computed = computeDocument(input.lines, { intraState, roundOff: input.roundOff, tdsAmount: input.tdsAmount, reverseCharge: input.isReverseCharge });
  if (!computed.subTotal.greaterThan(0)) throw badRequest('The document total must be more than zero.');
  if (input.tdsAmount.greaterThan(computed.subTotal)) throw badRequest('TDS cannot be more than the taxable value.');
  return { party, placeOfSupply, intraState, computed };
};

const lineData = (computed: ReturnType<typeof computeDocument>) =>
  computed.lines.map((line, index) => ({
    lineNo: index + 1,
    description: line.description,
    accountId: line.accountId,
    hsnSac: line.hsnSac,
    quantity: line.quantity,
    rate: line.rate,
    discount: line.discount,
    taxableValue: line.taxableValue,
    gstRate: line.gstRate,
    cgst: line.cgst,
    sgst: line.sgst,
    igst: line.igst,
    itcEligible: line.itcEligible,
    sellAccountId: line.sellAccountId,
    costCentreId: line.costCentreId,
  }));

const headerData = (input: DocumentInput, prepared: Awaited<ReturnType<typeof prepare>>) => ({
  docType: input.docType,
  date: input.date,
  dueDate: input.dueDate,
  partyId: input.partyId,
  partyDocNumber: input.partyDocNumber,
  placeOfSupply: prepared.placeOfSupply,
  isIntraState: prepared.intraState,
  isReverseCharge: input.isReverseCharge,
  reason: input.reason,
  againstDocumentId: input.againstDocumentId,
  againstReference: input.againstReference,
  sellAccountId: input.sellAccountId,
  notes: input.notes,
  subTotal: prepared.computed.subTotal,
  cgst: prepared.computed.cgst,
  sgst: prepared.computed.sgst,
  igst: prepared.computed.igst,
  tdsSection: input.tdsSection,
  tdsAmount: input.tdsAmount,
  roundOff: input.roundOff,
  total: prepared.computed.total,
});

const audit = (tx: Prisma.TransactionClient, access: LedgerAccess, id: string, action: string, after: unknown, reason?: string | null) =>
  writeFinAudit({ ...access.actor, entityType: 'FinDocument', entityId: id, action, after, reason: reason ?? null }, tx);

const serialize = (document: Prisma.FinDocumentGetPayload<{ include: { lines: true; party: { select: { id: true; code: true; name: true; gstin: true; stateCode: true } } } }>) => ({
  ...document,
  date: document.date.toISOString().slice(0, 10),
  dueDate: document.dueDate?.toISOString().slice(0, 10) ?? null,
  subTotal: document.subTotal.toNumber(), cgst: document.cgst.toNumber(), sgst: document.sgst.toNumber(), igst: document.igst.toNumber(),
  tdsAmount: document.tdsAmount.toNumber(), roundOff: document.roundOff.toNumber(), total: document.total.toNumber(),
  lines: document.lines.sort((a, b) => a.lineNo - b.lineNo).map((line) => ({
    ...line,
    quantity: line.quantity.toNumber(), rate: line.rate.toNumber(), discount: line.discount.toNumber(), taxableValue: line.taxableValue.toNumber(),
    gstRate: line.gstRate.toNumber(), cgst: line.cgst.toNumber(), sgst: line.sgst.toNumber(), igst: line.igst.toNumber(),
  })),
});

const include = { lines: true, party: { select: { id: true, code: true, name: true, gstin: true, stateCode: true } } } as const;

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

export const listDocuments = async (query: Record<string, unknown>) => {
  const types = typeof query.types === 'string' ? query.types.split(',').filter((type): type is FinDocumentType => (Object.values(FinDocumentType) as string[]).includes(type)) : [];
  const from = readDate(query, 'from', 'From date');
  const to = readDate(query, 'to', 'To date');
  const q = typeof query.q === 'string' ? query.q.trim().slice(0, 60) : '';
  const page = Math.max(Number.parseInt(String(query.page || '1'), 10) || 1, 1);
  const pageSize = Math.min(Math.max(Number.parseInt(String(query.pageSize || '25'), 10) || 25, 1), 200);
  const where: Prisma.FinDocumentWhereInput = {
    ...(types.length ? { docType: { in: types } } : {}),
    ...(typeof query.status === 'string' && query.status ? { status: query.status as never } : {}),
    ...(typeof query.reason === 'string' && query.reason ? { reason: query.reason as never } : {}),
    ...(typeof query.partyId === 'string' && query.partyId ? { partyId: query.partyId } : {}),
    ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { partyDocNumber: { contains: q, mode: 'insensitive' } }, { party: { name: { contains: q, mode: 'insensitive' } } }, { againstReference: { contains: q, mode: 'insensitive' } }] } : {}),
  };
  const [documents, total, sums] = await Promise.all([
    prisma.finDocument.findMany({ where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * pageSize, take: pageSize, include: { party: { select: { id: true, code: true, name: true } } } }),
    prisma.finDocument.count({ where }),
    prisma.finDocument.groupBy({ by: ['status'], where, _count: { _all: true }, _sum: { total: true, subTotal: true } }),
  ]);
  return {
    documents: documents.map((document) => ({ ...document, date: document.date.toISOString().slice(0, 10), dueDate: document.dueDate?.toISOString().slice(0, 10) ?? null, subTotal: document.subTotal.toNumber(), total: document.total.toNumber(), cgst: document.cgst.toNumber(), sgst: document.sgst.toNumber(), igst: document.igst.toNumber(), tdsAmount: document.tdsAmount.toNumber(), roundOff: document.roundOff.toNumber() })),
    total,
    page,
    pageSize,
    summary: sums.map((row) => ({ status: row.status, count: row._count._all, total: row._sum.total?.toNumber() ?? 0, taxable: row._sum.subTotal?.toNumber() ?? 0 })),
  };
};

export const getDocument = async (id: string) => {
  const document = await prisma.finDocument.findUnique({ where: { id }, include });
  if (!document) throw notFound('Document not found.');
  const [voucher, against] = await Promise.all([
    document.voucherId ? prisma.finVoucher.findUnique({ where: { id: document.voucherId }, select: { id: true, number: true, status: true, reversal: { select: { id: true, number: true } } } }) : Promise.resolve(null),
    document.againstDocumentId ? prisma.finDocument.findUnique({ where: { id: document.againstDocumentId }, select: { id: true, number: true, date: true, total: true } }) : Promise.resolve(null),
  ]);
  return { ...serialize(document), voucher, against: against ? { ...against, total: against.total.toNumber() } : null };
};

export const createDocument = async (body: Record<string, unknown>, access: LedgerAccess, allowedTypes: readonly FinDocumentType[]) => {
  const input = readDocumentInput(body, allowedTypes);
  return prisma.$transaction(async (tx) => {
    const prepared = await prepare(tx, input);
    const document = await tx.finDocument.create({
      data: { ...headerData(input, prepared), createdById: access.actor.actorUserId, updatedById: access.actor.actorUserId, lines: { create: lineData(prepared.computed) } },
    });
    await audit(tx, access, document.id, 'CREATE', { docType: document.docType, total: document.total.toNumber() });
    return { id: document.id };
  }, { timeout: 30000 });
};

const lockDocument = async (tx: Prisma.TransactionClient, id: string) => {
  await tx.$queryRaw`SELECT id FROM "FinDocument" WHERE id = ${id} FOR UPDATE`;
  const document = await tx.finDocument.findUnique({ where: { id }, include: { lines: true } });
  if (!document) throw notFound('Document not found.');
  return document;
};

export const updateDocument = async (id: string, body: Record<string, unknown>, access: LedgerAccess, allowedTypes: readonly FinDocumentType[]) => {
  const input = readDocumentInput(body, allowedTypes);
  return prisma.$transaction(async (tx) => {
    const existing = await lockDocument(tx, id);
    if (existing.status !== 'DRAFT') throw badRequest('Only draft documents can be edited. Cancel a posted document and enter it again.');
    if (existing.docType !== input.docType) throw badRequest('The document type cannot change.');
    const prepared = await prepare(tx, input, id);
    await tx.finDocumentLine.deleteMany({ where: { documentId: id } });
    await tx.finDocument.update({ where: { id }, data: { ...headerData(input, prepared), updatedById: access.actor.actorUserId, lines: { create: lineData(prepared.computed) } } });
    await audit(tx, access, id, 'UPDATE', { total: prepared.computed.total.toNumber(), previousTotal: existing.total.toNumber() });
    return { id };
  }, { timeout: 30000 });
};

export const deleteDocument = async (id: string, access: LedgerAccess, allowedTypes: readonly FinDocumentType[]) =>
  prisma.$transaction(async (tx) => {
    const existing = await lockDocument(tx, id);
    if (!allowedTypes.includes(existing.docType)) throw new FinHttpError(403, 'You cannot change this kind of document.');
    if (existing.status !== 'DRAFT') throw badRequest('Only drafts can be deleted. Cancel a posted document instead.');
    await tx.finDocument.delete({ where: { id } });
    await audit(tx, access, id, 'DELETE_DRAFT', { docType: existing.docType, total: existing.total.toNumber(), partyDocNumber: existing.partyDocNumber });
    return { deleted: true };
  });

const rowToInput = (document: Awaited<ReturnType<typeof lockDocument>>): DocumentInput => ({
  docType: document.docType,
  date: document.date,
  dueDate: document.dueDate,
  partyId: document.partyId,
  partyDocNumber: document.partyDocNumber,
  placeOfSupply: document.placeOfSupply,
  isReverseCharge: document.isReverseCharge,
  reason: document.reason,
  againstDocumentId: document.againstDocumentId,
  againstReference: document.againstReference,
  sellAccountId: document.sellAccountId,
  notes: document.notes,
  tdsSection: document.tdsSection,
  tdsAmount: document.tdsAmount,
  roundOff: document.roundOff,
  lines: document.lines.sort((a, b) => a.lineNo - b.lineNo).map((line) => ({
    description: line.description, accountId: line.accountId, hsnSac: line.hsnSac, quantity: line.quantity, rate: line.rate,
    discount: line.discount, gstRate: line.gstRate, itcEligible: line.itcEligible, sellAccountId: line.sellAccountId, costCentreId: line.costCentreId,
  })),
});

const systemLookup = async (tx: Prisma.TransactionClient) => {
  const accounts = await tx.finAccount.findMany({ where: { systemKey: { not: null } }, select: { id: true, systemKey: true } });
  const map = new Map(accounts.map((account) => [account.systemKey!, account.id]));
  return (key: string) => {
    const id = map.get(key);
    if (!id) throw badRequest(`Ledger with system role ${key} is missing. Install the default chart of accounts.`);
    return id;
  };
};

export const postDocument = async (id: string, access: LedgerAccess, allowedTypes: readonly FinDocumentType[]) =>
  prisma.$transaction(async (tx) => {
    const document = await lockDocument(tx, id);
    if (!allowedTypes.includes(document.docType)) throw new FinHttpError(403, 'You cannot post this kind of document.');
    if (document.status !== 'DRAFT') throw badRequest('This document is already posted or cancelled.');
    const input = rowToInput(document);
    const prepared = await prepare(tx, input, id);
    const period = await resolvePeriod(tx, document.date);
    const error = periodPostingError(period, access.canPostSoftClosed);
    if (error) throw badRequest(error);

    const lines = documentVoucherLines(document.docType, prepared.computed, {
      partyId: document.partyId, reverseCharge: document.isReverseCharge, tdsAmount: document.tdsAmount, roundOff: document.roundOff, system: await systemLookup(tx),
    }).map((line) => ({ ...line, sellAccountId: line.sellAccountId ?? (line.partyId ? document.sellAccountId : null) }));
    const refs = await loadReferences(tx, { lines, partyId: document.partyId, costCentreId: null, sellAccountId: document.sellAccountId });
    const type = DOCUMENT_VOUCHER_TYPE[document.docType];
    const label = { PURCHASE_BILL: 'Purchase bill', SALES_INVOICE: 'Sales invoice', CREDIT_NOTE: 'Credit note', DEBIT_NOTE: 'Debit note' }[document.docType];
    const narration = `${label}${document.partyDocNumber ? ` ${document.partyDocNumber}` : ''} — ${prepared.party.name}${document.againstReference ? ` (against ${document.againstReference})` : ''}`;
    const total = validateVoucher({ type, lines, narration, partyId: document.partyId, costCentreId: null, sellAccountId: document.sellAccountId }, refs, { manual: false });
    const number = await assignNumber(tx, type, period.year);
    const now = new Date();
    const voucher = await tx.finVoucher.create({
      data: {
        number, type, date: document.date, yearId: period.yearId, periodId: period.id, status: 'POSTED', narration,
        reference: document.partyDocNumber, partyId: document.partyId, sellAccountId: document.sellAccountId, totalAmount: total,
        sourceType: 'DOCUMENT', sourceId: document.id, sourceEvent: document.docType,
        createdById: access.actor.actorUserId, postedById: access.actor.actorUserId, postedAt: now,
        lines: { create: lineRows(lines) },
      },
    });
    await tx.finDocument.update({ where: { id }, data: { status: 'POSTED', number, voucherId: voucher.id, postedById: access.actor.actorUserId, postedAt: now } });
    await audit(tx, access, id, 'POST', { number, total: document.total.toNumber() });
    return { id, number, voucherId: voucher.id };
  }, { timeout: 30000 });

export const cancelDocument = async (id: string, body: Record<string, unknown>, access: LedgerAccess, allowedTypes: readonly FinDocumentType[]) => {
  const reason = readMultiline(body, 'reason', 'Reason', 500);
  if (!reason) throw badRequest('A reason is required to cancel a posted document.');
  const date = readDate(body, 'date', 'Cancellation date');
  return prisma.$transaction(async (tx) => {
    const document = await lockDocument(tx, id);
    if (!allowedTypes.includes(document.docType)) throw new FinHttpError(403, 'You cannot cancel this kind of document.');
    if (document.status !== 'POSTED' || !document.voucherId) throw badRequest('Only posted documents can be cancelled.');
    const notes = await tx.finDocument.count({ where: { againstDocumentId: id, status: 'POSTED' } });
    if (notes) throw badRequest('Cancel the credit/debit notes raised against this document first.');
    const voucher = await tx.finVoucher.findUnique({ where: { id: document.voucherId }, include: lockedInclude });
    if (voucher && voucher.status === 'POSTED') await reverseInTx(tx, voucher, access, `Document cancelled: ${reason}`, date ?? document.date, { allowSystem: true });
    await tx.finDocument.update({ where: { id }, data: { status: 'CANCELLED', cancelReason: reason, cancelledById: access.actor.actorUserId, cancelledAt: new Date() } });
    await audit(tx, access, id, 'CANCEL', { number: document.number }, reason);
    return { id, status: 'CANCELLED' };
  }, { timeout: 30000 });
};
